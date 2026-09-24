import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import CatalogProgress from '../components/CatalogProgress'
import Hero from '../components/Hero'
import PosterCard from '../components/PosterCard'
import Row from '../components/Row'
import { useMovieCatalog, useSeriesCatalog } from '../hooks/useCatalog'
import { useLibraryStore } from '../store/library'

export default function HomePage() {
  const movies = useMovieCatalog()
  const series = useSeriesCatalog()
  const navigate = useNavigate()
  const progress = useLibraryStore((s) => s.progress)
  const favorites = useLibraryStore((s) => s.favorites)
  const removeProgress = useLibraryStore((s) => s.removeProgress)

  const continueWatching = useMemo(
    () => Object.values(progress).sort((a, b) => b.updatedAt - a.updatedAt),
    [progress],
  )

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
        {continueWatching.length > 0 && (
          <Row title="Continuar assistindo">
            {continueWatching.map((p) => (
              <div key={`${p.kind}-${p.id}`} className="group relative shrink-0">
                <PosterCard
                  title={p.name}
                  image={p.image}
                  onClick={() =>
                    navigate(
                      `/watch/${p.kind}/${p.id}?ext=${p.ext || 'mp4'}&name=${encodeURIComponent(
                        p.name,
                      )}&image=${encodeURIComponent(p.image || '')}${p.seriesId ? `&seriesId=${p.seriesId}` : ''}`,
                    )
                  }
                  subtitle={`${Math.round((p.positionSeconds / (p.durationSeconds || 1)) * 100)}% assistido`}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeProgress(`${p.kind}-${p.id}`)
                  }}
                  className="absolute right-1 top-1 z-10 hidden h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-white hover:bg-black group-hover:flex"
                  title="Remover de continuar assistindo"
                >
                  ✕
                </button>
              </div>
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
          <Row key={category.categoryId} title={category.categoryName} loading={loading && items.length === 0}>
            {items.slice(0, 25).map((m) => (
              <PosterCard
                key={m.streamId}
                title={m.name}
                image={m.streamIcon}
                onClick={() => navigate(`/movies/${m.streamId}`)}
              />
            ))}
          </Row>
        ))}

        {series.error && <p className="px-4 text-sm text-rose-400 sm:px-10">{series.error}</p>}
        {visibleSeriesGroups.map(({ category, items, loading }) => (
          <Row key={category.categoryId} title={category.categoryName} loading={loading && items.length === 0}>
            {items.slice(0, 25).map((s) => (
              <PosterCard
                key={s.seriesId}
                title={s.name}
                image={s.cover}
                onClick={() => navigate(`/series/${s.seriesId}`)}
              />
            ))}
          </Row>
        ))}
      </div>
    </div>
  )
}
