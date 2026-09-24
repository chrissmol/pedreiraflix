import { useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import CatalogProgress from '../components/CatalogProgress'
import CategoryRow from '../components/CategoryRow'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import HeroCarousel, { type FeaturedCandidate } from '../components/HeroCarousel'
import PosterCard from '../components/PosterCard'
import Row from '../components/Row'
import { flattenGroups, useMovieCatalog, useSeriesCatalog } from '../hooks/useCatalog'
import { favoritesFor, useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'
import type { Movie, SeriesItem } from '../types'

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

  // Categories stream in one at a time (see useCatalog.ts) — computing `featured` on every partial update
  // meant the hero flickered through whichever titles happened to be loaded so far, settling only once
  // everything finished. Freezing it until every category has fully loaded avoids that: it's computed once
  // per catalog load, from the complete data, not a moving target.
  const catalogSettled =
    !movies.loading && !series.loading && movies.groups.every((g) => !g.loading) && series.groups.every((g) => !g.loading)
  const featuredRef = useRef<FeaturedCandidate[]>([])
  const featured = useMemo<FeaturedCandidate[]>(() => {
    if (!catalogSettled) return featuredRef.current
    const flatMovies = flattenGroups(movies.groups)
    const flatSeries = flattenGroups(series.groups)
    const next = pickFeatured(flatMovies, flatSeries).map((it) => {
      const isSeries = 'seriesId' in it
      return {
        key: isSeries ? `series-${it.seriesId}` : `movie-${it.streamId}`,
        title: it.name,
        description: 'plot' in it ? it.plot : null,
        image: isSeries ? it.cover : it.streamIcon,
        onPlay: () => navigate(isSeries ? `/series/${it.seriesId}` : `/movies/${it.streamId}`),
      }
    })
    featuredRef.current = next
    return next
  }, [catalogSettled, movies.groups, series.groups, navigate])

  const visibleMovieGroups = useMemo(
    () => movies.groups.filter((g) => g.items.length > 0 || g.loading).slice(0, 12),
    [movies.groups],
  )
  const visibleSeriesGroups = useMemo(
    () => series.groups.filter((g) => g.items.length > 0 || g.loading).slice(0, 12),
    [series.groups],
  )

  return (
    <div>
      <HeroCarousel items={featured} />

      <div className="relative z-10 pt-8 sm:pt-10">
        <ContinueWatchingRow />

        {favorites.length > 0 && (
          <Row title="Minha lista">
            {favorites.map((f) => (
              <PosterCard
                key={`${f.kind}-${f.id}`}
                title={f.name}
                image={f.image}
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
        {movies.error && <p className="px-4 text-sm text-rose-400 sm:px-10">{movies.error}</p>}
        {visibleMovieGroups.map(({ category, items, loading }) => (
          <CategoryRow
            key={category.categoryId}
            kind="movie"
            title={category.categoryName}
            loading={loading && items.length === 0}
            items={items}
            limit={25}
          />
        ))}

        {series.error && <p className="px-4 text-sm text-rose-400 sm:px-10">{series.error}</p>}
        {visibleSeriesGroups.map(({ category, items, loading }) => (
          <CategoryRow
            key={category.categoryId}
            kind="series"
            title={category.categoryName}
            loading={loading && items.length === 0}
            items={items}
            limit={25}
          />
        ))}
      </div>
    </div>
  )
}
