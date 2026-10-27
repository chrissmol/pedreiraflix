import { useEffect, useRef, useState } from 'react'
import { Check, Plus, X } from './icons'
import { useXtream } from '../hooks/useXtream'
import { cached } from '../lib/cache'
import { displayTitle } from '../lib/displayTitle'
import { useMinuteClock } from '../lib/minuteClock'
import { useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'
import type { EpgProgram, LiveChannel } from '../types'

interface LiveChannelCardProps {
  channel: LiveChannel
  onOpen: () => void
  /** So em Recentes: mostra um X que tira o canal da lista. */
  onRemove?: () => void
}

/** Same parsing the rest of the app uses for EPG times: a string with no zone is read as local time. */
const toDate = (value: string) => new Date(value.replace(' ', 'T'))

export default function LiveChannelCard({ channel, onOpen, onRemove }: LiveChannelCardProps) {
  const client = useXtream()
  const profileId = useActiveProfileId()
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite)
  const isFavorite = useLibraryStore((s) => s.isFavorite(profileId, 'live', channel.streamId))

  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [program, setProgram] = useState<EpgProgram | null>(null)
  const [logoFalhou, setLogoFalhou] = useState(false)
  const nome = displayTitle(channel.name)

  // A lineup is routinely hundreds of channels and each one's "what's on" is its own request, so this
  // only asks for the handful actually on screen — scrolling fetches the rest, and `cached` keeps a
  // channel from being asked twice.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || !client) return
    let cancelled = false
    cached(`epg-now:${channel.streamId}`, () => client.getShortEpg(channel.streamId, 2))
      .then((programs) => {
        if (cancelled) return
        // O cache e stale-while-revalidate: entrega o valor guardado (de ate 24h) e so depois atualiza em
        // segundo plano. Para "o que esta no ar agora" isso significa mostrar o programa de ontem como se
        // fosse o atual. Entao o que importa nao e a idade da entrada, e sim se o programa ja acabou —
        // por isso vem dois, e fica o primeiro que ainda nao terminou.
        const now = Date.now()
        setProgram(programs.find((p) => toDate(p.end).getTime() > now) ?? null)
      })
      // No EPG for this channel is the normal case on many providers, not an error worth showing.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [visible, client, channel.streamId])

  // The bar has to advance while the page is open, so "now" comes from a shared minute clock rather than a
  // `Date.now()` read during render (which would freeze at whatever the first render saw). One interval for
  // every card on screen — see lib/minuteClock.ts.
  const nowMs = useMinuteClock(Boolean(program))

  let progress: number | null = null
  let endsAt = ''
  if (program) {
    const start = toDate(program.start).getTime()
    const end = toDate(program.end).getTime()
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      progress = Math.min(100, Math.max(0, ((nowMs - start) / (end - start)) * 100))
      endsAt = toDate(program.end).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }
  }

  return (
    <div
      ref={ref}
      data-testid={`live-card-${channel.streamId}`}
      className="group relative flex items-center gap-3 rounded-2xl border border-outline-soft bg-surface-low p-3 [content-visibility:auto] [contain-intrinsic-size:auto_88px] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 hover:border-outline-strong hover:bg-surface-container"
    >
      <button data-spatial onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-high">
          {channel.streamIcon && !logoFalhou ? (
            <img
              src={channel.streamIcon}
              alt=""
              loading="lazy"
              className="max-h-11 max-w-11 object-contain"
              onError={() => setLogoFalhou(true)}
            />
          ) : (
            <span className="text-label-md font-bold text-on-surface-variant">{nome.slice(0, 2).toUpperCase()}</span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-label-md text-white">{nome}</span>
            {channel.hasArchive && (
              <span className="shrink-0 rounded bg-brand-500/15 px-1.5 py-0.5 text-label-badge font-bold text-brand-300">REVER</span>
            )}
          </span>
          {program ? (
            <>
              <span className="mt-0.5 flex items-baseline gap-1.5">
                <span className="truncate text-body-sm text-white/85">{displayTitle(program.title)}</span>
                {endsAt && <span className="shrink-0 text-label-badge text-on-surface-muted">até {endsAt}</span>}
              </span>
              {progress != null && (
                <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
                </span>
              )}
            </>
          ) : (
            <span className="mt-0.5 block text-body-sm text-on-surface-muted">Sem programação</span>
          )}
        </span>
      </button>

      {/* Sempre visivel, tambem no mouse: esconder acao atras de hover ja foi corrigido tres vezes neste
          projeto, e a preferencia registrada e nao precisar passar o mouse em cima para ver o que da para
          fazer. */}
      <button
        onClick={() =>
          toggleFavorite(profileId, { kind: 'live', id: channel.streamId, name: channel.name, image: channel.streamIcon })
        }
        aria-label={isFavorite ? `Remover ${nome} dos favoritos` : `Favoritar ${nome}`}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
          isFavorite ? 'bg-brand-500/15 text-brand-300' : 'text-on-surface-muted hover:bg-surface-high hover:text-white'
        }`}
      >
        {isFavorite ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Tirar ${nome} dos recentes`}
          title="Tirar dos recentes"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-muted transition-colors hover:bg-surface-high hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
