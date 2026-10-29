import { useEffect, useMemo, useState } from 'react'
import ErrorCard from '../components/ErrorCard'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveCatalog } from '../hooks/useCatalog'
import { displayTitle } from '../lib/displayTitle'
import { searchCatalog } from '../lib/search'
import type { LiveChannel } from '../types'
import { Check, ChevronDown, Plus, Trophy, Tv, X } from '../components/icons'
import { useMinuteClock } from '../lib/minuteClock'
import { matchWhen } from '../lib/matchTime'
import { type FavoriteTeam, teamsFor, useLibraryStore } from '../store/library'
import { COMPETITIONS, COMPETITION_PREFIX, type Broadcast, type Competition, type CompetitionData, type NextMatchData, competitionBySlug, getJson, loadCompetition } from '../lib/competitions'
import { useActiveProfileId } from '../store/profiles'

const STORE_COLLAPSED = 'pf-teams-collapsed'
const STORE_TAB = 'pf-teams-tab'
function readStore<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T
  } catch {
    return fallback
  }
}
function writeStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* sem armazenamento (modo privado): so nao lembra */
  }
}

/** Cabecalho de card recolhivel: tocar no titulo abre/fecha; recolhido, mostra so o proximo jogo. */
function CardHeader({ id, lead, title, open, onToggle, onRemove, removeLabel, summary }: {
  id: string
  lead: React.ReactNode
  title: string
  open: boolean
  onToggle: () => void
  onRemove: () => void
  removeLabel: string
  summary?: NextMatchData
}) {
  const now = useMinuteClock(Boolean(summary) && !open)
  const when = summary && matchWhen(summary.match.kickoff, summary.match.status, now)
  return (
    <div className={`flex items-center gap-3 ${open ? 'mb-4' : ''}`}>
      {lead}
      <h2 id={id} className="min-w-0 flex-1 font-display text-headline-sm text-white">
        <button onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Recolher' : 'Expandir'} ${title}`} className="brand-focus flex w-full items-center gap-2 rounded-lg text-left pointer-coarse:min-h-10">
          <span className="truncate">{title}</span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-on-surface-variant transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {!open && summary && when && (
          <span className="block truncate text-body-sm font-normal text-on-surface-variant">
            {when.live ? 'Ao vivo' : `${when.day} · ${when.time}`} · {summary.match.home} × {summary.match.away}
          </span>
        )}
      </h2>
      <button
        onClick={onRemove}
        aria-label={removeLabel}
        className="brand-focus rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-high hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function TeamMatches({ team, onRemove, open, onToggle }: { team: FavoriteTeam; onRemove: () => void; open: boolean; onToggle: () => void }) {
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
      <CardHeader
        id={`team-${team.slug}`}
        lead={
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-label-md font-bold text-white"
            style={{ background: teamColor(team.slug) }}
          >
            {initials(team.name)}
          </span>
        }
        title={team.name}
        open={open}
        onToggle={onToggle}
        onRemove={onRemove}
        removeLabel={`Deixar de seguir ${team.name}`}
        summary={next}
      />
      <div hidden={!open}>
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
      </div>
    </section>
  )
}

// Once a channel is confirmed, the probable guesses are noise: show only the confirmed ones.
function shownBroadcasts(all: Broadcast[]) {
  const confirmed = all.filter((b) => b.confidence === 'confirmada')
  return confirmed.length ? confirmed : all
}

/** Tocar no canal procura o nome dele nos canais ao vivo do provedor: um achado abre direto, vários viram opções
 * e nenhum avisa. Só monta ao tocar, porque carregar a lista de canais é o custo da Live.
 * shortcut: casa pelo nome do canal ("Globo" acha "Globo SP HD"); não distingue praça nem qualidade. */
function ChannelPicker({ channel, onClose }: { channel: string; onClose: () => void }) {
  const navigate = useNavigate()
  const live = useLiveCatalog()
  const hits = useMemo(
    () => searchCatalog(live.groups, channel).filter((h) => h.rank <= 3).slice(0, 8).map((h) => h.item),
    [live.groups, channel],
  )
  const open = (c: LiveChannel) => navigate(`/watch/live/${c.streamId}?name=${encodeURIComponent(c.name)}`)
  const waiting = live.loading || live.groups.some((g) => g.loading)
  // Um único canal parecido: vai direto, sem pedir outro toque.
  useEffect(() => {
    if (!waiting && hits.length === 1) navigate(`/watch/live/${hits[0].streamId}?name=${encodeURIComponent(hits[0].name)}`)
  }, [waiting, hits, navigate])

  return (
    <div role="status" className="mt-2 w-full rounded-xl border border-outline-soft bg-surface-high p-3 text-body-sm">
      {waiting && hits.length === 0 ? (
        <p className="text-on-surface-variant">Procurando {channel} nos seus canais…</p>
      ) : hits.length === 0 ? (
        <>
          <p className="text-white">Seu provedor não tem o canal {channel}.</p>
          <p className="mb-2 text-on-surface-variant">Pode ser que ele passe como outro nome. Veja pela busca.</p>
          <Link to={`/search?${new URLSearchParams({ q: channel })}`} className="brand-focus mr-2 rounded-full bg-brand-500/15 px-3 py-1 text-label-md text-brand-300">
            Buscar {channel}
          </Link>
        </>
      ) : (
        <>
          <p className="mb-2 text-on-surface-variant">Seu provedor tem {hits.length} canais com esse nome. Escolha um:</p>
          <ul className="flex flex-wrap gap-1.5">
            {hits.map((c) => (
              <li key={c.streamId}>
                <button onClick={() => open(c)} className="brand-focus inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1 text-label-md text-white hover:bg-surface-low pointer-coarse:min-h-9">
                  <Tv className="h-3.5 w-3.5" />
                  {displayTitle(c.name)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <button onClick={onClose} className="brand-focus mt-2 rounded-full px-3 py-1 text-label-md text-on-surface-variant hover:text-white">
        Fechar
      </button>
    </div>
  )
}

/** "Confirmado" só quando a API garante (curadoria); o resto é palpite por regra e diz "provável". */
function Channels({ broadcasts }: { broadcasts: Broadcast[] }) {
  const shown = shownBroadcasts(broadcasts)
  const [picked, setPicked] = useState<string | null>(null)
  return (
    <div>
      <ul aria-label="Onde passa" className="flex flex-wrap gap-1.5">
        {shown.length === 0 ? (
          <li className="rounded-full border border-dashed border-outline-soft px-3 py-1 text-label-md text-on-surface-variant">Canal a confirmar</li>
        ) : (
          shown.map((b) => {
            const sure = b.confidence === 'confirmada'
            return (
              <li key={b.slug}>
                <button
                  onClick={() => setPicked(picked === b.channel ? null : b.channel)}
                  aria-expanded={picked === b.channel}
                  aria-label={`${b.channel}, ${sure ? 'confirmado' : 'provável'}: abrir o canal ao vivo`}
                  className={`brand-focus inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label-md transition-colors pointer-coarse:min-h-9 ${
                    sure ? 'bg-brand-500/15 text-brand-300 hover:bg-brand-500/25' : 'border border-outline-soft text-white hover:bg-surface-high'
                  }`}
                >
                  {sure ? <Check className="h-3.5 w-3.5" /> : <Tv className="h-3.5 w-3.5" />}
                  {b.channel}
                  <span className={sure ? '' : 'text-on-surface-variant'}>· {sure ? 'confirmado' : 'provável'}</span>
                </button>
              </li>
            )
          })
        )}
      </ul>
      {picked && <ChannelPicker channel={picked} onClose={() => setPicked(null)} />}
    </div>
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

const PAGE_SIZE = 5
const MAX_SHOWN = 10

/** Campeonato seguido: os times dele (tocar segue o time) e os próximos jogos com o canal. 5 jogos, "Ver mais" até 10. */
function CompetitionCard({ comp, followedTeams, onToggleTeam, onRemove, open, onToggle }: {
  open: boolean
  onToggle: () => void
  comp: Competition
  followedTeams: FavoriteTeam[]
  onToggleTeam: (t: FavoriteTeam) => void
  onRemove: () => void
}) {
  const [data, setData] = useState<CompetitionData | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [limit, setLimit] = useState(PAGE_SIZE)
  // Só os times seguidos ao abrir entram na busca: seguir um time daqui não recarrega o card (o jogo dele já está na lista).
  const [seedTeams] = useState(followedTeams)

  useEffect(() => {
    let alive = true
    loadCompetition(comp, seedTeams, attempt)
      .then((d) => alive && setData(d))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [comp, seedTeams, attempt])

  const now = useMinuteClock(Boolean(data?.matches.length))
  const upcoming = (data?.matches ?? []).filter((m) => matchWhen(m.match.kickoff, m.match.status, now).live || new Date(m.match.kickoff).getTime() > now - 135 * 60_000)
  const shown = upcoming.slice(0, limit)
  const [next, ...later] = shown

  return (
    <section aria-labelledby={`comp-${comp.slug}`} className="rounded-2xl border border-outline-soft bg-surface-low p-4 sm:p-5">
      <CardHeader
        id={`comp-${comp.slug}`}
        lead={<Trophy aria-hidden className="h-6 w-6 shrink-0 text-brand-400" />}
        title={comp.name}
        open={open}
        onToggle={onToggle}
        onRemove={onRemove}
        removeLabel={`Deixar de seguir ${comp.name}`}
        summary={next}
      />
      <div hidden={!open}>
      {data && data.teams.length > 0 && (
        <ul aria-label="Times do campeonato" className="mb-4 flex flex-wrap gap-1.5">
          {data.teams.map((t) => {
            const on = followedTeams.some((f) => f.slug === t.slug)
            return (
              <li key={t.slug}>
                <button
                  onClick={() => onToggleTeam(t)}
                  aria-pressed={on}
                  aria-label={`${on ? 'Deixar de seguir' : 'Seguir'} ${t.name}`}
                  className={`brand-focus inline-flex items-center gap-1 rounded-full px-3 py-1 text-label-md transition-colors pointer-coarse:min-h-9 ${
                    on ? 'bg-brand-500/15 text-brand-300' : 'bg-surface-high text-white hover:bg-surface-container'
                  }`}
                >
                  {on ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {t.name}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {failed ? (
        <ErrorCard className="!mx-0" message="Não deu para buscar os jogos agora." onRetry={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }} />
      ) : data === null ? (
        <p className="text-body-sm text-on-surface-variant">Buscando jogos…</p>
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
          {limit < MAX_SHOWN && upcoming.length > limit && (
            <button onClick={() => setLimit(MAX_SHOWN)} className="brand-focus mt-2 rounded-full px-3 py-1.5 text-label-md text-brand-300 hover:bg-surface-high">
              Ver mais jogos
            </button>
          )}
        </>
      )}
      </div>
    </section>
  )
}

/** Escolher campeonatos, por grupo. Recolhido: são 17 botões, que atrapalhariam quem navega só com setas.
 * Os grupos viram uma fileira de botões (com quantos você já segue) e só o aberto mostra os campeonatos: a TV passa
 * por poucos botões de cada vez, e os campeonatos ficam logo abaixo do grupo, ao alcance da seta para baixo. */
function CompetitionPicker({ followed, onToggle }: { followed: string[]; onToggle: (c: Competition) => void }) {
  const [open, setOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const groups = [...new Set(COMPETITIONS.map((c) => c.group))]
  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="brand-focus mb-2 inline-flex items-center gap-1.5 rounded-full bg-surface-high px-4 py-2 text-label-md text-white hover:bg-surface-container"
      >
        <Trophy className="h-4 w-4 text-brand-400" />
        {open ? 'Esconder campeonatos' : 'Seguir um campeonato'}
      </button>
      {open && (
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            {groups.map((g) => {
              const list = COMPETITIONS.filter((c) => c.group === g)
              const count = list.filter((c) => followed.includes(c.slug)).length
              const expanded = openGroup === g
              return (
                <button
                  key={g}
                  onClick={() => setOpenGroup(expanded ? null : g)}
                  aria-expanded={expanded}
                  className={`brand-focus inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-label-md transition-colors pointer-coarse:min-h-11 ${
                    expanded ? 'bg-brand-500 text-white' : 'bg-surface-low text-white hover:bg-surface-container'
                  }`}
                >
                  {g}
                  {count > 0 && <span className="opacity-80">{count}</span>}
                  <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
              )
            })}
          </div>
          {openGroup && (
            <ul aria-label={openGroup} className="flex flex-wrap gap-2 rounded-xl bg-surface-low p-3">
              {COMPETITIONS.filter((c) => c.group === openGroup).map((c) => {
                const on = followed.includes(c.slug)
                return (
                  <li key={c.slug}>
                    <button
                      onClick={() => onToggle(c)}
                      aria-pressed={on}
                      className={`brand-focus flex items-center gap-1.5 rounded-full px-4 py-2 text-label-md transition-colors ${
                        on ? 'bg-brand-500/15 text-brand-300' : 'bg-surface-high text-white hover:bg-surface-container'
                      }`}
                    >
                      {on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      {c.name}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

type Tab = 'times' | 'campeonatos'

/** "Recolher tudo / Expandir tudo": some quando há só um card. */
function FoldAll({ slugs, collapsed, onSet }: { slugs: string[]; collapsed: string[]; onSet: (slugs: string[], close: boolean) => void }) {
  if (slugs.length < 2) return null
  const allClosed = slugs.every((s) => collapsed.includes(s))
  return (
    <button onClick={() => onSet(slugs, !allClosed)} className="brand-focus mb-3 rounded-full px-3 py-1.5 text-label-md text-brand-300 hover:bg-surface-high">
      {allClosed ? 'Expandir tudo' : 'Recolher tudo'}
    </button>
  )
}

export default function TeamsPage() {
  const profileId = useActiveProfileId()
  const favoriteTeams = useLibraryStore((s) => s.favoriteTeams)
  const toggleTeam = useLibraryStore((s) => s.toggleTeam)
  // shortcut: campeonatos seguidos ficam na mesma lista dos times, com slug "comp:<slug>", para sincronizarem entre
  // aparelhos sem mudar o formato do sync. Separar numa lista propria se algum dia isso atrapalhar.
  const all = useMemo(() => teamsFor(favoriteTeams, profileId), [favoriteTeams, profileId])
  const teams = useMemo(() => all.filter((t) => !t.slug.startsWith(COMPETITION_PREFIX)), [all])
  const comps = useMemo(
    () => all.flatMap((t) => (t.slug.startsWith(COMPETITION_PREFIX) ? [competitionBySlug(t.slug.slice(COMPETITION_PREFIX.length))] : [])).filter((c): c is Competition => !!c),
    [all],
  )
  const toggleComp = (c: Competition) => toggleTeam(profileId, { slug: COMPETITION_PREFIX + c.slug, name: c.name })
  const [tab, setTab] = useState<Tab>(() => (readStore<Tab>(STORE_TAB, 'times') === 'campeonatos' ? 'campeonatos' : 'times'))
  const changeTab = (t: Tab) => {
    setTab(t)
    writeStore(STORE_TAB, t)
  }
  // Recolhidos ficam guardados por slug neste aparelho; o padrão é tudo aberto.
  const [collapsed, setCollapsed] = useState<string[]>(() => readStore<string[]>(STORE_COLLAPSED, []))
  const setAll = (slugs: string[], close: boolean) => {
    const next = close ? [...new Set([...collapsed, ...slugs])] : collapsed.filter((s) => !slugs.includes(s))
    setCollapsed(next)
    writeStore(STORE_COLLAPSED, next)
  }
  const toggleOpen = (slug: string) => setAll([slug], !collapsed.includes(slug))
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
      <p className="mb-6 text-body-md text-on-surface-variant">Os próximos jogos dos times e campeonatos que você segue e em qual canal passam.</p>

      <div role="tablist" aria-label="Times e campeonatos" className="mb-6 inline-flex rounded-full bg-surface-high p-1">
        {([['times', 'Times', teams.length], ['campeonatos', 'Campeonatos', comps.length]] as const).map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`painel-${id}`}
            onClick={() => changeTab(id)}
            className={`brand-focus rounded-full px-5 py-2 text-label-md transition-colors pointer-coarse:min-h-11 ${
              tab === id ? 'bg-brand-500 text-white' : 'text-on-surface-variant hover:text-white'
            }`}
          >
            {label}
            {n > 0 && <span className="ml-1.5 opacity-80">{n}</span>}
          </button>
        ))}
      </div>

      {tab === 'times' ? (
        <div role="tabpanel" id="painel-times" aria-labelledby="tab-times">
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
      <div aria-live="polite" className="mb-6 mt-3 max-w-md">
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
            <p className="text-body-md text-on-surface-variant">Busque um time acima para ver aqui onde passam os próximos jogos. Para seguir um campeonato inteiro, use a aba Campeonatos.</p>
          ) : (
            <>
              <FoldAll slugs={teams.map((t) => t.slug)} collapsed={collapsed} onSet={setAll} />
              <div className="grid gap-4 lg:grid-cols-2">
                {teams.map((t) => (
                  <TeamMatches key={t.slug} team={t} open={!collapsed.includes(t.slug)} onToggle={() => toggleOpen(t.slug)} onRemove={() => toggleTeam(profileId, t)} />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div role="tabpanel" id="painel-campeonatos" aria-labelledby="tab-campeonatos">
          <CompetitionPicker followed={comps.map((c) => c.slug)} onToggle={toggleComp} />
          {comps.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">Siga um campeonato para ver os times dele e onde passam os próximos jogos.</p>
          ) : (
            <>
              <FoldAll slugs={comps.map((c) => c.slug)} collapsed={collapsed} onSet={setAll} />
              {[...new Set(comps.map((c) => c.group))].map((g) => (
                <div key={g} className="mb-6">
                  <h2 className="mb-2 text-label-md uppercase tracking-wide text-on-surface-variant">{g}</h2>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {comps
                      .filter((c) => c.group === g)
                      .map((c) => (
                        <CompetitionCard key={c.slug} comp={c} followedTeams={teams} open={!collapsed.includes(c.slug)} onToggle={() => toggleOpen(c.slug)} onToggleTeam={(t) => toggleTeam(profileId, t)} onRemove={() => toggleComp(c)} />
                      ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
