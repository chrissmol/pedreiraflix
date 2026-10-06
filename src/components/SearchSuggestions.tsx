import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Film, Layers, Tv } from './icons'
import { flattenGroups, useLiveCatalog, useMovieCatalog, useSeriesCatalog } from '../hooks/useCatalog'
import { matchesQuery } from '../lib/search'

interface Suggestion {
  key: string
  name: string
  image: string | null
  kind: 'movie' | 'series' | 'live'
  path: string
}

interface SearchSuggestionsProps {
  query: string
  onNavigate: () => void
}

const KIND_ICON = { movie: Film, series: Layers, live: Tv } as const
const KIND_LABEL = { movie: 'Filme', series: 'Série', live: 'Canal' } as const

// Only mounted once the user has actually typed something (see TopNav) — the three catalog hooks below
// start fetching as soon as they're called, and most sessions never open search at all, so this must not
// run unconditionally just because the (always-mounted) search box exists.
export default function SearchSuggestions({ query, onNavigate }: SearchSuggestionsProps) {
  const navigate = useNavigate()
  const movies = useMovieCatalog()
  const series = useSeriesCatalog()
  const live = useLiveCatalog()

  const results = useMemo<Suggestion[]>(() => {
    const movieHits = flattenGroups(movies.groups)
      .filter((m) => matchesQuery(m.name, query))
      .slice(0, 4)
      .map((m): Suggestion => ({ key: `movie-${m.streamId}`, name: m.name, image: m.streamIcon, kind: 'movie', path: `/movies/${m.streamId}` }))
    const seriesHits = flattenGroups(series.groups)
      .filter((s) => matchesQuery(s.name, query))
      .slice(0, 4)
      .map((s): Suggestion => ({ key: `series-${s.seriesId}`, name: s.name, image: s.cover, kind: 'series', path: `/series/${s.seriesId}` }))
    const liveHits = flattenGroups(live.groups)
      .filter((c) => matchesQuery(c.name, query))
      .slice(0, 3)
      .map(
        (c): Suggestion => ({
          key: `live-${c.streamId}`,
          name: c.name,
          image: c.streamIcon,
          kind: 'live',
          path: `/watch/live/${c.streamId}?name=${encodeURIComponent(c.name)}`,
        }),
      )
    return [...movieHits, ...seriesHits, ...liveHits].slice(0, 8)
  }, [movies.groups, series.groups, live.groups, query])

  const stillLoading = movies.loading || series.loading || live.loading

  if (results.length === 0 && !stillLoading) return null

  return (
    // `right-0` + an explicit width, not `left-0 right-0`: the search `<form>` this is anchored to is
    // only as wide as the input itself (as little as 40px at rest, ~190px focused on a phone — see
    // TopNav), so stretching the dropdown to match that box made it too narrow to hold a result row and
    // forced it wider than its container, overflowing past the right edge of narrow phones entirely. A
    // fixed width anchored to the input's right edge, capped to the viewport, stays on screen regardless
    // of how wide the input itself currently is.
    <div className="glass-panel absolute right-0 top-full mt-2 max-h-96 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl text-sm shadow-2xl">
      {results.map((r) => {
        const Icon = KIND_ICON[r.kind]
        return (
          <button
            key={r.key}
            onClick={() => {
              navigate(r.path)
              onNavigate()
            }}
            className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/10 active:bg-white/10"
          >
            <span className="flex h-10 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-high">
              {r.image ? (
                <img src={r.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <Icon className="h-4 w-4 text-zinc-500" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-white">{r.name}</span>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{KIND_LABEL[r.kind]}</span>
          </button>
        )
      })}
      {results.length === 0 && stillLoading && <p className="px-3 py-3 text-zinc-400">Buscando...</p>}
    </div>
  )
}
