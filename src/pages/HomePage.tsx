import { cleanCategoryName } from '../lib/channelGroups'
import { movieYear } from '../lib/displayTitle'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CatalogProgress from '../components/CatalogProgress'
import CategoryRow from '../components/CategoryRow'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import LiveNowRow from '../components/LiveNowRow'
import HeroCarousel, { type FeaturedCandidate } from '../components/HeroCarousel'
import { Shuffle } from '../components/icons'
import PosterCard from '../components/PosterCard'
import Row from '../components/Row'
import TrendingRow from '../components/TrendingRow'
import { flattenGroups, useMovieCatalog, useSeriesCatalog } from '../hooks/useCatalog'
import { favoritesFor, progressFor, useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'
import type { Movie, SeriesItem } from '../types'
import ErrorCard from '../components/ErrorCard'

interface RecommendedItem {
  kind: 'movie' | 'series'
  id: number
  name: string
  image: string | null
  rating: number
}

// The rule (explicitly requested): only the household's "must-watch" bar, ≥8.5 — no fallback to
// lower-rated content if nothing qualifies yet, that's the point of "só". Alternates movie/series/movie/…
// so it's never two of the same kind back to back, each sorted best-first within its own kind.
const MIN_RATING = 8.5

function pickFeatured(movies: Movie[], series: SeriesItem[]): (Movie | SeriesItem)[] {
  const topMovies = movies.filter((m) => m.streamIcon && Number(m.rating) >= MIN_RATING).sort((a, b) => Number(b.rating) - Number(a.rating))
  const topSeries = series.filter((s) => s.cover && Number(s.rating) >= MIN_RATING).sort((a, b) => Number(b.rating) - Number(a.rating))

  const alternating: (Movie | SeriesItem)[] = []
  for (let i = 0; i < Math.max(topMovies.length, topSeries.length); i++) {
    if (topMovies[i]) alternating.push(topMovies[i])
    if (topSeries[i]) alternating.push(topSeries[i])
  }
  return alternating
}

export default function HomePage() {
  const movies = useMovieCatalog()
  const series = useSeriesCatalog()
  const navigate = useNavigate()
  const profileId = useActiveProfileId()
  const favoritesRecord = useLibraryStore((s) => s.favorites)
  const favorites = useMemo(() => favoritesFor(favoritesRecord, profileId), [favoritesRecord, profileId])
  const progressRecord = useLibraryStore((s) => s.progress)
  const progressItems = useMemo(() => progressFor(progressRecord, profileId), [progressRecord, profileId])

  // Categories stream in one at a time (see useCatalog.ts) — computing `featured` on every partial update
  // meant the hero flickered through whichever titles happened to be loaded so far, settling only once
  // everything finished. Freezing it until every category has fully loaded avoids that: it's computed once
  // per catalog load, from the complete data, not a moving target.
  const catalogSettled =
    !movies.loading && !series.loading && movies.groups.every((g) => !g.loading) && series.groups.every((g) => !g.loading)
  // null = ainda nao escolhido (o destaque mostra o esqueleto); [] = escolhido e nao ha o que destacar.
  const [featured, setFeatured] = useState<FeaturedCandidate[] | null>(null)
  useEffect(() => {
    if (!catalogSettled) return
    const flatMovies = flattenGroups(movies.groups)
    const flatSeries = flattenGroups(series.groups)
    // oxlint-disable-next-line react/set-state-in-effect -- freezes the hero until the catalog settles, not derivable during render.
    setFeatured(
      pickFeatured(flatMovies, flatSeries).map((it) => {
        const isSeries = 'seriesId' in it
        return {
          key: isSeries ? `series-${it.seriesId}` : `movie-${it.streamId}`,
          title: it.name,
          description: 'plot' in it ? it.plot : null,
          image: isSeries ? it.cover : it.streamIcon,
          kind: isSeries ? ('series' as const) : ('movie' as const),
          id: isSeries ? it.seriesId : it.streamId,
          rating: Number(it.rating) || 0,
          meta: isSeries ? [it.releaseDate?.slice(0, 4), it.genre?.split(/[,/]/)[0]?.trim()].filter((m): m is string => !!m) : [],
          onPlay: () => navigate(isSeries ? `/series/${it.seriesId}` : `/movies/${it.streamId}`),
        }
      }),
    )
  }, [catalogSettled, movies.groups, series.groups, navigate])

  const visibleMovieGroups = useMemo(
    () => movies.groups.filter((g) => g.items.length > 0 || g.loading).slice(0, 12),
    [movies.groups],
  )
  const visibleSeriesGroups = useMemo(
    () => series.groups.filter((g) => g.items.length > 0 || g.loading).slice(0, 12),
    [series.groups],
  )

  // Only movies carry `added` in the basic catalog listing (get_vod_streams) — series' equivalent field
  // isn't returned by this provider's get_series call, so this row is movies-only rather than mixed.
  const recentMovies = useMemo(() => {
    return flattenGroups(movies.groups)
      .filter((m) => m.added && Number(m.added) > 0)
      .sort((a, b) => Number(b.added) - Number(a.added))
      .slice(0, 25)
  }, [movies.groups])

  // "Recomendado pra você": genre isn't available in the basic catalog listing for movies (only via a
  // per-title detail call, too expensive to do for the whole catalog), so this uses categoryId instead —
  // available on every item already loaded, and in practice close to genre on most Xtream panels (e.g.
  // "Ação", "Comédia" are categories, not just a metadata field). Categories the profile already likes
  // (favorited or in progress) surface their other, not-yet-seen titles, best-rated first.
  const recommended = useMemo<RecommendedItem[]>(() => {
    const flatMovies = flattenGroups(movies.groups)
    const flatSeries = flattenGroups(series.groups)
    const movieById = new Map(flatMovies.map((m) => [m.streamId, m]))
    const seriesById = new Map(flatSeries.map((s) => [s.seriesId, s]))

    const likedCategoryIds = new Set<string>()
    for (const f of favorites) {
      if (f.kind === 'movie') {
        const categoryId = movieById.get(f.id)?.categoryId
        if (categoryId) likedCategoryIds.add(categoryId)
      }
      if (f.kind === 'series') {
        const categoryId = seriesById.get(f.id)?.categoryId
        if (categoryId) likedCategoryIds.add(categoryId)
      }
    }
    for (const p of progressItems) {
      if (p.kind === 'movie') {
        const categoryId = movieById.get(Number(p.id))?.categoryId
        if (categoryId) likedCategoryIds.add(categoryId)
      }
      if (p.kind === 'series' && p.seriesId) {
        const categoryId = seriesById.get(p.seriesId)?.categoryId
        if (categoryId) likedCategoryIds.add(categoryId)
      }
    }
    if (likedCategoryIds.size === 0) return []

    const excludeMovieIds = new Set([
      ...favorites.filter((f) => f.kind === 'movie').map((f) => f.id),
      ...progressItems.filter((p) => p.kind === 'movie').map((p) => Number(p.id)),
    ])
    const excludeSeriesIds = new Set([
      ...favorites.filter((f) => f.kind === 'series').map((f) => f.id),
      ...progressItems.filter((p) => p.kind === 'series').map((p) => p.seriesId).filter((id): id is number => id != null),
    ])

    const candidates: RecommendedItem[] = [
      ...flatMovies
        .filter((m) => likedCategoryIds.has(m.categoryId) && !excludeMovieIds.has(m.streamId))
        .map((m) => ({ kind: 'movie' as const, id: m.streamId, name: m.name, image: m.streamIcon, rating: Number(m.rating) || 0 })),
      ...flatSeries
        .filter((s) => likedCategoryIds.has(s.categoryId) && !excludeSeriesIds.has(s.seriesId))
        .map((s) => ({ kind: 'series' as const, id: s.seriesId, name: s.name, image: s.cover, rating: Number(s.rating) || 0 })),
    ]
    return candidates.sort((a, b) => b.rating - a.rating).slice(0, 25)
  }, [movies.groups, series.groups, favorites, progressItems])

  // "Surpreenda-me": picks a uniformly random title from everything loaded so far, favoring nothing —
  // deliberately not weighted by rating, that's what the hero carousel is already for.
  function surpreendaMe() {
    const pool = [
      ...flattenGroups(movies.groups).map((m) => ({ kind: 'movie' as const, id: m.streamId })),
      ...flattenGroups(series.groups).map((s) => ({ kind: 'series' as const, id: s.seriesId })),
    ]
    if (pool.length === 0) return
    const pick = pool[Math.floor(Math.random() * pool.length)]
    navigate(pick.kind === 'movie' ? `/movies/${pick.id}` : `/series/${pick.id}`)
  }

  return (
    <div>
      {/* "Surpreenda-me" lives in the hero's own button row rather than floating alone above the first
          row, where it read as a stray control. Label hidden on phones so three buttons still fit. */}
      <HeroCarousel
        items={featured ?? []}
        loading={featured === null}
        action={
          <button
            onClick={surpreendaMe}
            aria-label="Surpreenda-me"
            title="Surpreenda-me"
            className="btn-icon sm:w-auto sm:gap-2 sm:px-6 sm:text-label-md"
          >
            <Shuffle className="h-5 w-5" />
            <span className="hidden sm:inline">Surpreenda-me</span>
          </button>
        }
      />

      <div className="relative z-10 pt-8 sm:pt-10">
        <ContinueWatchingRow />
        <LiveNowRow />

        {recentMovies.length > 0 && (
          <Row title="Adicionados recentemente">
            {recentMovies.map((m) => (
              <PosterCard key={m.streamId} title={m.name} image={m.streamIcon} imdb={{ title: m.name, year: movieYear(m), kind: 'movie' }} watchedRef={{ kind: 'movie', id: m.streamId }} onClick={() => navigate(`/movies/${m.streamId}`)} />
            ))}
          </Row>
        )}

        <TrendingRow />

        {recommended.length > 0 && (
          <Row title="Recomendado pra você">
            {recommended.map((r) => (
              <PosterCard
                key={`${r.kind}-${r.id}`}
                title={r.name}
                image={r.image}
                imdb={{ title: r.name, kind: r.kind === 'movie' ? 'movie' : 'tv' }}
                watchedRef={{ kind: r.kind === 'movie' ? 'movie' : 'series', id: r.id }}
                onClick={() => navigate(r.kind === 'movie' ? `/movies/${r.id}` : `/series/${r.id}`)}
              />
            ))}
          </Row>
        )}

        {favorites.length > 0 && (
          <Row title="Minha lista">
            {favorites.map((f) => (
              <PosterCard
                key={`${f.kind}-${f.id}`}
                title={f.name}
                image={f.image}
                watchedRef={f.kind === 'live' ? undefined : { kind: f.kind, id: f.id }}
                onClick={() =>
                  navigate(
                    f.kind === 'live'
                      ? `/watch/live/${f.id}?name=${encodeURIComponent(f.name)}`
                      : `/${f.kind === 'movie' ? 'movies' : 'series'}/${f.id}`,
                  )
                }
              />
            ))}
          </Row>
        )}

        <CatalogProgress groups={[...movies.groups, ...series.groups]} label="Carregando catálogo" />
        {movies.error && <ErrorCard message={movies.error} onRetry={movies.retry} className="mb-8" />}
        {visibleMovieGroups.map(({ category, items, loading }) => (
          <CategoryRow
            key={category.categoryId}
            kind="movie"
            title={cleanCategoryName(category.categoryName)}
            loading={loading && items.length === 0}
            items={items}
            limit={25}
            categoryId={category.categoryId}
          />
        ))}

        {series.error && <ErrorCard message={series.error} onRetry={series.retry} className="mb-8" />}
        {visibleSeriesGroups.map(({ category, items, loading }) => (
          <CategoryRow
            key={category.categoryId}
            kind="series"
            title={cleanCategoryName(category.categoryName)}
            loading={loading && items.length === 0}
            items={items}
            limit={25}
            categoryId={category.categoryId}
          />
        ))}
      </div>
    </div>
  )
}
