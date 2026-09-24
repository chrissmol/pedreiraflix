import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import CatalogProgress from '../components/CatalogProgress'
import CategoryRow from '../components/CategoryRow'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import Hero from '../components/Hero'
import PosterCard from '../components/PosterCard'
import Row from '../components/Row'
import { useMovieCatalog, useSeriesCatalog } from '../hooks/useCatalog'
import { favoritesFor, useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'

export default function HomePage() {
  const movies = useMovieCatalog()
  const series = useSeriesCatalog()
  const navigate = useNavigate()
  const profileId = useActiveProfileId()
  const favoritesRecord = useLibraryStore((s) => s.favorites)
  const favorites = useMemo(() => favoritesFor(favoritesRecord, profileId), [favoritesRecord, profileId])

  const featured = useMemo(() => {
    for (const group of series.groups) {
      const withImage = group.items.find((s) => s.cover)
      if (withImage) return withImage
    }
    for (const group of movies.groups) {
      const withImage = group.items.find((m) => m.streamIcon)
      if (withImage) return withImage
    }
    return null
  }, [movies.groups, series.groups])

  const visibleMovieGroups = useMemo(
    () => movies.groups.filter((g) => g.items.length > 0 || g.loading).slice(0, 12),
    [movies.groups],
  )
  const visibleSeriesGroups = useMemo(
    () => series.groups.filter((g) => g.items.length > 0 || g.loading).slice(0, 12),
    [series.groups],
  )

  function playFeatured() {
    if (!featured) return
    if ('seriesId' in featured) navigate(`/series/${featured.seriesId}`)
    else navigate(`/movies/${featured.streamId}`)
  }

  return (
    <div>
      {featured && (
        <Hero
          title={featured.name}
          description={'plot' in featured ? featured.plot : null}
          image={'cover' in featured ? featured.cover : featured.streamIcon}
          onPlay={playFeatured}
          onInfo={playFeatured}
        />
      )}

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
