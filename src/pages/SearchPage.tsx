import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import LiveChannelCard from '../components/LiveChannelCard'
import PosterCard from '../components/PosterCard'
import { useLiveCatalog, useMovieCatalog, useSeriesCatalog } from '../hooks/useCatalog'
import { matchesQuery } from '../lib/search'
import PageLoading from '../components/PageLoading'

// Buscar "a" no painel do Christian dava ~29 mil cartoes montados de uma vez (209 mil nos do DOM). Cada secao
// mostra um bloco e o resto vem em "Mostrar mais".
const BLOCK = 60

type Section = 'movies' | 'series' | 'live'

export default function SearchPage() {
  const [params] = useSearchParams()
  const query = (params.get('q') || '').trim()
  const navigate = useNavigate()
  // O quanto cada secao ja foi ampliada pertence a uma busca: outra busca volta ao primeiro bloco.
  const [extra, setExtra] = useState({ q: query, movies: 0, series: 0, live: 0 })
  const added = extra.q === query ? extra : { q: query, movies: 0, series: 0, live: 0 }
  const more = (section: Section) => setExtra({ ...added, [section]: added[section] + BLOCK })
  const shown = (section: Section) => BLOCK + added[section]

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

      {loading && <PageLoading label="Carregando catálogo" className="py-8" />}
      {!loading && total === 0 && <p className="text-on-surface-variant">Nenhum resultado encontrado.</p>}

      {results.movies.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 flex items-center gap-2 text-headline-sm text-white">
            <span className="h-4 w-1 rounded-full bg-brand-500" />
            Filmes
          </h2>
          <div className="flex flex-wrap gap-3">
            {results.movies.slice(0, shown('movies')).map((m) => (
              <PosterCard key={m.streamId} title={m.name} image={m.streamIcon} badge={Number(m.rating) > 0 ? `★ ${Number(m.rating).toFixed(1)}` : null} onClick={() => navigate(`/movies/${m.streamId}`)} />
            ))}
          </div>
          {results.movies.length > shown('movies') && (
            <button onClick={() => more('movies')} className="btn-secondary mt-4">
              Mostrar mais ({results.movies.length - shown('movies')})
            </button>
          )}
        </section>
      )}

      {results.series.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 flex items-center gap-2 text-headline-sm text-white">
            <span className="h-4 w-1 rounded-full bg-brand-500" />
            Séries
          </h2>
          <div className="flex flex-wrap gap-3">
            {results.series.slice(0, shown('series')).map((s) => (
              <PosterCard key={s.seriesId} title={s.name} image={s.cover} badge={Number(s.rating) > 0 ? `★ ${Number(s.rating).toFixed(1)}` : null} onClick={() => navigate(`/series/${s.seriesId}`)} />
            ))}
          </div>
          {results.series.length > shown('series') && (
            <button onClick={() => more('series')} className="btn-secondary mt-4">
              Mostrar mais ({results.series.length - shown('series')})
            </button>
          )}
        </section>
      )}

      {results.live.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 flex items-center gap-2 text-headline-sm text-white">
            <span className="h-4 w-1 rounded-full bg-brand-500" />
            Canais
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))] gap-3">
            {results.live.slice(0, shown('live')).map((c) => (
              <LiveChannelCard
                key={c.streamId}
                channel={c}
                onOpen={() => navigate(`/watch/live/${c.streamId}?name=${encodeURIComponent(c.name)}`)}
              />
            ))}
          </div>
          {results.live.length > shown('live') && (
            <button onClick={() => more('live')} className="btn-secondary mt-4">
              Mostrar mais ({results.live.length - shown('live')})
            </button>
          )}
        </section>
      )}
    </div>
  )
}
