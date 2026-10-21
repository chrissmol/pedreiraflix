import { useEffect, useMemo, useState } from 'react'
import ErrorCard from '../components/ErrorCard'
import { Link } from 'react-router-dom'
import { Check, Plus, Trophy, Tv, X } from '../components/icons'
import { useMinuteClock } from '../lib/minuteClock'
import { matchWhen } from '../lib/matchTime'
import { type FavoriteTeam, teamsFor, useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'

// Shapes of the Mol TV API (proxied by our Worker at /api/moltv): which channel airs each team's next matches.
interface Broadcast {
  channel: string
  slug: string
  confidence: 'confirmada' | 'provavel' | string
}
interface NextMatchData {
  match: { id: string; home: string; away: string; kickoff: string; competition: string; status: string }
  broadcasts: Broadcast[]
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`/api/moltv${path}`)
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as T
}

function TeamMatches({ team, onRemove }: { team: FavoriteTeam; onRemove: () => void }) {
  const [matches, setMatches] = useState<NextMatchData[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Fetched on every visit: the Mol TV API refreshes channels itself (cron + on-demand after 6 h, 10 min cache).
  useEffect(() => {
    let alive = true
    getJson<{ matches: NextMatchData[] }>(`/v1/teams/${team.slug}/next`)
      .then((d) => alive && setMatches(d.matches))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [team.slug, attempt])

  const now = useMinuteClock(Boolean(matches?.length))
  const [next, ...later] = matches ?? []

  return (
    <section aria-labelledby={`team-${team.slug}`} className="rounded-2xl border border-outline-soft bg-surface-low p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-label-md font-bold text-white"
          style={{ background: teamColor(team.slug) }}
        >
          {initials(team.name)}
        </span>
        <h2 id={`team-${team.slug}`} className="min-w-0 flex-1 truncate font-display text-headline-sm text-white">
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
      ) : !next ? (
        <p className="text-body-sm text-on-surface-variant">Nenhum jogo marcado por enquanto.</p>
      ) : (
        <>
          <NextMatch item={next} now={now} />
          {later.length > 0 && (
            <ul aria-label="Depois" className="mt-2 divide-y divide-outline-soft">
              {later.map((item) => (
                <LaterMatch key={item.match.id} item={item} now={now} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

// Once a channel is confirmed, the probable guesses are noise: show only the confirmed ones.
function shownBroadcasts(all: Broadcast[]) {
  const confirmed = all.filter((b) => b.confidence === 'confirmada')
  return confirmed.length ? confirmed : all
}

/** Each channel opens the search with its name: the IPTV list may carry it as "Globo SP HD" or several variants. */
function Channels({ broadcasts }: { broadcasts: Broadcast[] }) {
  const shown = shownBroadcasts(broadcasts)
  return (
    <ul aria-label="Onde passa" className="flex flex-wrap gap-1.5">
      {shown.length === 0 ? (
        <li className="rounded-full border border-dashed border-outline-soft px-3 py-1 text-label-md text-on-surface-variant">Canal a confirmar</li>
      ) : (
        shown.map((b) => {
          const sure = b.confidence === 'confirmada'
          return (
            <li key={b.slug}>
              <Link
                to={`/search?${new URLSearchParams({ q: b.channel })}`}
                aria-label={`${b.channel}${sure ? '' : ', provável'}: procurar o canal`}
                className={`brand-focus inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label-md transition-colors pointer-coarse:min-h-9 ${
                  sure ? 'bg-brand-500/15 text-brand-300 hover:bg-brand-500/25' : 'border border-outline-soft text-white hover:bg-surface-high'
                }`}
              >
                <Tv className="h-3.5 w-3.5" />
                {b.channel}
                {!sure && <span className="text-on-surface-variant">· provável</span>}
              </Link>
            </li>
          )
        })
      )}
    </ul>
  )
}

function Teams({ match, className }: { match: NextMatchData['match']; className: string }) {
  return (
    <p className={className}>
      {match.home} <span className="text-on-surface-variant">×</span> {match.away}
    </p>
  )
}

function NextMatch({ item: { match, broadcasts }, now }: { item: NextMatchData; now: number }) {
  const when = matchWhen(match.kickoff, match.status, now)
  return (
    <div className={`rounded-xl bg-surface-container p-4 ${when.live ? 'ring-1 ring-live/50' : ''}`}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-label-md">
        {when.live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-live px-2.5 py-0.5 font-semibold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Ao vivo
          </span>
        ) : (
          <span className="font-semibold text-brand-300">
            {when.day} · {when.time}
          </span>
        )}
        {when.countdown && <span className="text-on-surface-variant">{when.countdown}</span>}
        <span className="ml-auto text-on-surface-variant">{match.competition}</span>
      </div>
      <Teams match={match} className="mb-3 text-body-lg font-semibold text-white" />
      <Channels broadcasts={broadcasts} />
    </div>
  )
}

function LaterMatch({ item: { match, broadcasts }, now }: { item: NextMatchData; now: number }) {
  const when = matchWhen(match.kickoff, match.status, now)
  return (
    <li className="flex gap-3 py-3">
      <div className="w-16 shrink-0 text-label-md">
        <p className={`font-semibold capitalize ${when.live ? 'text-live' : 'text-white'}`}>{when.live ? 'Ao vivo' : when.day}</p>
        <p className="text-on-surface-variant">{when.time}</p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div>
          <Teams match={match} className="text-body-md font-semibold text-white" />
          <p className="text-body-sm text-on-surface-variant">{match.competition}</p>
        </div>
        <Channels broadcasts={broadcasts} />
      </div>
    </li>
  )
}

function initials(name: string) {
  const words = name.split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w))
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase()
}

/** A steady colour per team (not its real colours — the API doesn't send those), so cards are told apart at a glance. */
function teamColor(slug: string) {
  let hash = 0
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return `hsl(${Math.abs(hash) % 360} 55% 36%)`
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
