import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import LiveChannelCard from '../components/LiveChannelCard'
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
    <div className="min-h-screen px-4 pt-[calc(6rem+env(safe-area-inset-top))] sm:px-10">
      <h1 className="font-display text-headline-md text-white sm:text-headline-lg mb-8">Resultados para "{query}"</h1>

      {loading && <p className="text-on-surface-variant">Carregando catálogo...</p>}
      {!loading && total === 0 && <p className="text-on-surface-variant">Nenhum resultado encontrado.</p>}

      {results.movies.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 flex items-center gap-2 text-headline-sm text-white">
            <span className="h-4 w-1 rounded-full bg-brand-500" />
            Filmes
          </h2>
          <div className="flex flex-wrap gap-3">
            {results.movies.map((m) => (
              <PosterCard key={m.streamId} title={m.name} image={m.streamIcon} badge={Number(m.rating) > 0 ? `★ ${Number(m.rating).toFixed(1)}` : null} onClick={() => navigate(`/movies/${m.streamId}`)} />
            ))}
          </div>
        </section>
      )}

      {results.series.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 flex items-center gap-2 text-headline-sm text-white">
            <span className="h-4 w-1 rounded-full bg-brand-500" />
            Séries
          </h2>
          <div className="flex flex-wrap gap-3">
            {results.series.map((s) => (
              <PosterCard key={s.seriesId} title={s.name} image={s.cover} badge={Number(s.rating) > 0 ? `★ ${Number(s.rating).toFixed(1)}` : null} onClick={() => navigate(`/series/${s.seriesId}`)} />
            ))}
          </div>
        </section>
      )}

      {results.live.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 flex items-center gap-2 text-headline-sm text-white">
            <span className="h-4 w-1 rounded-full bg-brand-500" />
            Canais
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-3">
            {results.live.map((c) => (
              <LiveChannelCard
                key={c.streamId}
                channel={c}
                onOpen={() => navigate(`/watch/live/${c.streamId}?name=${encodeURIComponent(c.name)}`)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
