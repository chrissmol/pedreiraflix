import { useEffect, useMemo, useState } from 'react'
import ErrorCard from '../components/ErrorCard'
import { Check, Plus, Trophy, X } from '../components/icons'
import { type FavoriteTeam, teamsFor, useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'

// Shapes of the Mol TV API (proxied by our Worker at /api/moltv): which channel airs each team's next matches.
interface Broadcast {
  channel: string
  slug: string
  confidence: 'confirmada' | 'provavel' | string
}
interface NextMatch {
  match: { id: string; home: string; away: string; kickoff: string; competition: string; status: string }
  broadcasts: Broadcast[]
}

const kickoffFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`/api/moltv${path}`)
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as T
}

function TeamMatches({ team, onRemove }: { team: FavoriteTeam; onRemove: () => void }) {
  const [matches, setMatches] = useState<NextMatch[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Fetched on every visit: the Mol TV API refreshes channels itself (cron + on-demand after 6 h, 10 min cache).
  useEffect(() => {
    let alive = true
    getJson<{ matches: NextMatch[] }>(`/v1/teams/${team.slug}/next`)
      .then((d) => alive && setMatches(d.matches))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [team.slug, attempt])

  return (
    <section aria-labelledby={`team-${team.slug}`} className="rounded-2xl border border-outline-soft bg-surface-low p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={`team-${team.slug}`} className="font-display text-headline-sm text-white">
          {team.name}
        </h2>
        <button
          onClick={onRemove}
          aria-label={`Deixar de seguir ${team.name}`}
          className="brand-focus rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-high hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {failed ? (
        <ErrorCard className="!mx-0" message="Não deu para buscar os jogos agora." onRetry={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }} />
      ) : matches === null ? (
        <p className="text-body-sm text-on-surface-variant">Buscando próximos jogos…</p>
      ) : matches.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">Nenhum jogo marcado por enquanto.</p>
      ) : (
        <ul className="divide-y divide-outline-soft">
          {matches.map(({ match, broadcasts }) => (
            <li key={match.id} className="flex flex-col gap-2 py-3">
              <div>
                <p className="text-body-md font-semibold text-white">
                  {match.home} × {match.away}
                </p>
                <p className="text-body-sm capitalize text-on-surface-variant">
                  {kickoffFormat.format(new Date(match.kickoff))} · {match.competition}
                </p>
              </div>
              <ul aria-label="Onde passa" className="flex flex-wrap gap-1.5">
                {broadcasts.length === 0 ? (
                  <li className="rounded-full border border-outline-soft px-3 py-1 text-label-md text-on-surface-variant">Canal a confirmar</li>
                ) : (
                  broadcasts.map((b) => (
                    <li key={b.slug} className="rounded-full bg-surface-high px-3 py-1 text-label-md text-white">
                      {b.channel}
                      {b.confidence !== 'confirmada' && <span className="text-on-surface-variant"> · provável</span>}
                    </li>
                  ))
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function TeamsPage() {
  const profileId = useActiveProfileId()
  const favoriteTeams = useLibraryStore((s) => s.favoriteTeams)
  const toggleTeam = useLibraryStore((s) => s.toggleTeam)
  const teams = useMemo(() => teamsFor(favoriteTeams, profileId), [favoriteTeams, profileId])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FavoriteTeam[] | null>(null)
  const [searchFailed, setSearchFailed] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) return
    let alive = true
    // Small debounce: the Mol TV search may hit an external source for names it hasn't seen yet.
    const timer = setTimeout(() => {
      setSearchFailed(false)
      getJson<{ results: (FavoriteTeam & { type: string })[] }>(`/v1/search?${new URLSearchParams({ q })}`)
        .then((d) => alive && setResults(d.results.filter((r) => r.type === 'team').map(({ slug, name }) => ({ slug, name }))))
        .catch(() => alive && setSearchFailed(true))
    }, 350)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [query])

  // Under 3 letters there's nothing to search; stale results from a longer query just aren't shown.
  const shown = query.trim().length >= 3 ? results : null
  const follows = (slug: string) => teams.some((t) => t.slug === slug)

  return (
    <div className="min-h-screen px-4 pb-32 pt-[calc(6rem+env(safe-area-inset-top))] sm:px-10">
      <div className="mb-1 flex items-center gap-2">
        <Trophy className="h-7 w-7 text-brand-400" />
        <h1 className="font-display text-headline-md text-white sm:text-headline-lg">Times favoritos</h1>
      </div>
      <p className="mb-6 text-body-md text-on-surface-variant">Os próximos jogos dos times que você segue e em qual canal passam.</p>

      <label htmlFor="team-search" className="mb-2 block text-label-md text-on-surface-variant">
        Seguir um time
      </label>
      <input
        id="team-search"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder="Ex.: Flamengo, Corinthians, Real Madrid"
        value={query}
        onChange={(e) => setQuery(e.target.value.slice(0, 40))}
        className="brand-focus h-11 w-full max-w-md rounded-full border border-outline-soft bg-surface-container px-4 text-white"
      />
      <div aria-live="polite" className="mb-8 mt-3 max-w-md">
        {searchFailed ? (
          <p className="text-body-sm text-on-surface-variant">A busca não respondeu. Tente de novo em instantes.</p>
        ) : shown?.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">Nenhum time encontrado.</p>
        ) : (
          shown && (
            <ul className="flex flex-wrap gap-2">
              {shown.map((t) => {
                const on = follows(t.slug)
                return (
                  <li key={t.slug}>
                    <button
                      onClick={() => toggleTeam(profileId, t)}
                      aria-pressed={on}
                      className={`brand-focus flex items-center gap-1.5 rounded-full px-4 py-2 text-label-md transition-colors ${
                        on ? 'bg-brand-500/15 text-brand-300' : 'bg-surface-high text-white hover:bg-surface-container'
                      }`}
                    >
                      {on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      {t.name}
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        )}
      </div>

      {teams.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">Busque um time acima para ver aqui onde passam os próximos jogos dele.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {teams.map((t) => (
            <TeamMatches key={t.slug} team={t} onRemove={() => toggleTeam(profileId, t)} />
          ))}
        </div>
      )}
    </div>
  )
}
