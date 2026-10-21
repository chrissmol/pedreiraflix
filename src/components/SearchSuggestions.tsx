import { displayTitle } from '../lib/displayTitle'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Film, Layers, Search, Tv } from './icons'
import { useLiveCatalog, useMovieCatalog, useSeriesCatalog } from '../hooks/useCatalog'
import { useDebounced } from '../hooks/useDebounced'
import { searchCatalog } from '../lib/search'

interface Suggestion {
  key: string
  name: string
  image: string | null
  kind: 'movie' | 'series' | 'live'
  path: string
  rank: number
}

interface SearchSuggestionsProps {
  query: string
  recent: string[]
  /** Abre um item (fecha a lista e lembra a busca). */
  onNavigate: () => void
  /** Vai para a pagina com todos os resultados de `q` (tambem usado pelas buscas recentes). */
  onSearch: (q: string) => void
}

const KIND_ICON = { movie: Film, series: Layers, live: Tv } as const
const KIND_LABEL = { movie: 'Filme', series: 'Série', live: 'Canal' } as const

// Only mounted once the search box gets focus (see TopNav) — the three catalog hooks below start fetching as soon as
// they're called, and most sessions never open search at all. Mounting on focus (not on the first letter) means the
// catalog is usually already loaded by the time the user finishes typing.
//
// Todos os botoes daqui sao type="button": esta lista fica dentro do <form> da busca, e um <button> sem tipo e de
// envio — o Enter no campo "clicava" a primeira sugestao e abria o primeiro filme em vez de mostrar os resultados.
export default function SearchSuggestions({ query: liveQuery, recent, onNavigate, onSearch }: SearchSuggestionsProps) {
  const navigate = useNavigate()
  const movies = useMovieCatalog()
  const series = useSeriesCatalog()
  const live = useLiveCatalog()
  const query = useDebounced(liveQuery, 150)

  const results = useMemo<Suggestion[]>(() => {
    if (query.length < 2) return []
    const movieHits = searchCatalog(movies.groups, query)
      .slice(0, 4)
      .map(({ item: m, rank }): Suggestion => ({ key: `movie-${m.streamId}`, name: m.name, image: m.streamIcon, kind: 'movie', path: `/movies/${m.streamId}`, rank }))
    const seriesHits = searchCatalog(series.groups, query)
      .slice(0, 4)
      .map(({ item: s, rank }): Suggestion => ({ key: `series-${s.seriesId}`, name: s.name, image: s.cover, kind: 'series', path: `/series/${s.seriesId}`, rank }))
    const liveHits = searchCatalog(live.groups, query)
      .slice(0, 3)
      .map(
        ({ item: c, rank }): Suggestion => ({
          key: `live-${c.streamId}`,
          name: c.name,
          image: c.streamIcon,
          kind: 'live',
          path: `/watch/live/${c.streamId}?name=${encodeURIComponent(c.name)}`,
          rank,
        }),
      )
    return [...movieHits, ...seriesHits, ...liveHits].sort((a, b) => a.rank - b.rank).slice(0, 8)
  }, [movies.groups, series.groups, live.groups, query])

  const stillLoading = movies.loading || series.loading || live.loading
  const typed = liveQuery.length >= 2

  if (!typed && recent.length === 0) return null

  return (
    // `right-0` + an explicit width, not `left-0 right-0`: the search `<form>` this is anchored to is only as wide as
    // the input itself, so a fixed width anchored to the input's right edge, capped to the viewport, stays on screen.
    <div className="menu-panel absolute right-0 top-full mt-2 max-h-96 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto">
      {!typed && (
        <>
          <p className="px-3 pb-1 pt-2 text-label-badge font-semibold uppercase tracking-wide text-on-surface-muted">Buscas recentes</p>
          {recent.map((q) => (
            <button key={q} type="button" data-suggestion onClick={() => onSearch(q)} className="menu-option py-2">
              <Clock className="h-4 w-4 shrink-0 text-on-surface-muted" />
              <span className="min-w-0 flex-1 truncate text-white">{q}</span>
            </button>
          ))}
        </>
      )}
      {typed &&
        results.map((r) => {
          const Icon = KIND_ICON[r.kind]
          return (
            <button
              key={r.key}
              type="button"
              data-suggestion
              onClick={() => {
                navigate(r.path)
                onNavigate()
              }}
              className="menu-option py-2"
            >
              <span className="flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-high">
                {r.image ? <img src={r.image} alt="" className="h-full w-full object-cover" /> : <Icon className="h-4 w-4 text-on-surface-muted" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-white">{displayTitle(r.name)}</span>
              <span className="shrink-0 rounded bg-surface-high px-1.5 py-0.5 text-label-badge font-semibold uppercase tracking-wide text-on-surface-variant">{KIND_LABEL[r.kind]}</span>
            </button>
          )
        })}
      {typed && results.length === 0 && (
        <p className="px-3 py-3 text-on-surface-variant">{stillLoading || query !== liveQuery ? 'Buscando…' : `Nada encontrado para "${liveQuery}".`}</p>
      )}
      {typed && results.length > 0 && (
        <button type="button" data-suggestion onClick={() => onSearch(liveQuery)} className="menu-option py-2 text-brand-300">
          <Search className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Ver todos os resultados</span>
        </button>
      )}
    </div>
  )
}
