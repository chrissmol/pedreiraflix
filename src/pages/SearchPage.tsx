import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PosterCard from '../components/PosterCard'
import { useLiveCatalog, useMovieCatalog, useSeriesCatalog } from '../hooks/useCatalog'
import { matchesQuery } from '../lib/search'

export default function SearchPage() {
  const [params] = useSearchParams()
  const query = (params.get('q') || '').trim()
  const navigate = useNavigate()

  const movies = useMovieCatalog()
  const series = useSeriesCatalog()
  const live = useLiveCatalog()

  // Matches on the item's own name OR its category name, so searching a
  // genre/category like "futebol" finds channels inside it even when the
  // channel's own name doesn't contain that word.
  function searchGroups<T extends { name: string }>(groups: { category: { categoryName: string }; items: T[] }[]): T[] {
    return groups.flatMap((g) => {
      const categoryMatches = matchesQuery(g.category.categoryName, query)
      return g.items.filter((item) => categoryMatches || matchesQuery(item.name, query))
    })
  }

  const results = useMemo(() => {
    if (!query) return { movies: [], series: [], live: [] }
    return {
      movies: searchGroups(movies.groups),
      series: searchGroups(series.groups),
      live: searchGroups(live.groups),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, movies.groups, series.groups, live.groups])

  const anyGroupLoading = (g: { loading: boolean }[]) => g.some((group) => group.loading)
  const loading =
    movies.loading ||
    series.loading ||
    live.loading ||
    anyGroupLoading(movies.groups) ||
    anyGroupLoading(series.groups) ||
    anyGroupLoading(live.groups)
  const total = results.movies.length + results.series.length + results.live.length

  return (
    <div className="min-h-screen px-4 pt-24 sm:px-10">
      <h1 className="mb-6 text-2xl font-bold text-white">Resultados para "{query}"</h1>

      {loading && <p className="text-zinc-400">Carregando catálogo...</p>}
      {!loading && total === 0 && <p className="text-zinc-500">Nenhum resultado encontrado.</p>}

      {results.movies.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-white">Filmes</h2>
          <div className="flex flex-wrap gap-3">
            {results.movies.map((m) => (
              <PosterCard key={m.streamId} title={m.name} image={m.streamIcon} onClick={() => navigate(`/movies/${m.streamId}`)} />
            ))}
          </div>
        </section>
      )}

      {results.series.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-white">Séries</h2>
          <div className="flex flex-wrap gap-3">
            {results.series.map((s) => (
              <PosterCard key={s.seriesId} title={s.name} image={s.cover} onClick={() => navigate(`/series/${s.seriesId}`)} />
            ))}
          </div>
        </section>
      )}

      {results.live.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-white">Canais</h2>
          <div className="flex flex-wrap gap-3">
            {results.live.map((c) => (
              <PosterCard
                key={c.streamId}
                title={c.name}
                image={c.streamIcon}
                onClick={() => navigate(`/watch/live/${c.streamId}?name=${encodeURIComponent(c.name)}`)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
