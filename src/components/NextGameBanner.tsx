import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy } from './icons'
import { COMPETITION_PREFIX, type NextMatchData, getJson } from '../lib/competitions'
import { useMinuteClock } from '../lib/minuteClock'
import { matchWhen } from '../lib/matchTime'
import { teamsFor, useLibraryStore } from '../store/library'
import { useActiveProfile, useActiveProfileId } from '../store/profiles'

const MAX_TEAMS = 5

/** Aviso no Inicio: o time que a pessoa segue joga hoje (ou ja esta jogando), com o canal. Sem time seguido, sem jogo
 * nas proximas 24 h ou em perfil infantil, nao aparece nem busca nada.
 * shortcut: aviso so dentro do app (nao ha push/notificacao com o app fechado); olha os 5 primeiros times seguidos. */
export default function NextGameBanner() {
  const profileId = useActiveProfileId()
  const isKids = Boolean(useActiveProfile()?.isKids)
  const record = useLibraryStore((s) => s.favoriteTeams)
  const slugs = useMemo(
    () => teamsFor(record, profileId).filter((t) => !t.slug.startsWith(COMPETITION_PREFIX)).slice(0, MAX_TEAMS).map((t) => t.slug),
    [record, profileId],
  )
  const [games, setGames] = useState<NextMatchData[]>([])
  useEffect(() => {
    if (isKids || slugs.length === 0) return
    let alive = true
    Promise.all(slugs.map((s) => getJson<{ matches: NextMatchData[] }>(`/v1/teams/${s}/next`).then((d) => d.matches[0]).catch(() => undefined))).then((list) => {
      if (!alive) return
      const byId = new Map<string, NextMatchData>()
      for (const m of list) if (m) byId.set(m.match.id, m)
      setGames([...byId.values()].sort((a, b) => a.match.kickoff.localeCompare(b.match.kickoff)))
    })
    return () => {
      alive = false
    }
  }, [slugs, isKids])
  const now = useMinuteClock(games.length > 0)
  if (isKids) return null
  const soon = games
    .map((g) => ({ g, when: matchWhen(g.match.kickoff, g.match.status, now) }))
    .filter(({ when }) => when.live || when.countdown)
  if (soon.length === 0) return null
  return (
    <section aria-label="Jogo do seu time" className="mb-4 px-4 sm:px-10">
      {soon.slice(0, 2).map(({ g, when }) => {
        const confirmed = g.broadcasts.filter((b) => b.confidence === 'confirmada')
        const channels = (confirmed.length ? confirmed : g.broadcasts).map((b) => b.channel).join(', ')
        return (
          <Link key={g.match.id} to="/times" className="brand-focus mb-2 flex items-center gap-3 rounded-2xl border border-outline-soft bg-surface-low p-3 sm:p-4">
            <Trophy className="h-6 w-6 shrink-0 text-brand-300" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-md font-semibold text-white">
                {g.match.home} × {g.match.away}
              </span>
              <span className="block truncate text-body-sm text-on-surface-variant">
                {when.live ? 'Ao vivo agora' : `${when.day} · ${when.time} · ${when.countdown}`}
                {channels && ` · ${channels}`}
              </span>
            </span>
          </Link>
        )
      })}
    </section>
  )
}
