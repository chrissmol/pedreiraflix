import { useEffect, useRef, useState } from 'react'
import { Check, Plus } from './icons'
import { useXtream } from '../hooks/useXtream'
import { cached } from '../lib/cache'
import { useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'
import type { EpgProgram, LiveChannel } from '../types'

interface LiveChannelCardProps {
  channel: LiveChannel
  onOpen: () => void
}

/** Same parsing the rest of the app uses for EPG times: a string with no zone is read as local time. */
const toDate = (value: string) => new Date(value.replace(' ', 'T'))

export default function LiveChannelCard({ channel, onOpen }: LiveChannelCardProps) {
  const client = useXtream()
  const profileId = useActiveProfileId()
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite)
  const isFavorite = useLibraryStore((s) => s.isFavorite(profileId, 'live', channel.streamId))

  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [program, setProgram] = useState<EpgProgram | null>(null)

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
    cached(`epg-now:${channel.streamId}`, () => client.getShortEpg(channel.streamId, 1))
      .then((programs) => {
        if (!cancelled) setProgram(programs[0] ?? null)
      })
      // No EPG for this channel is the normal case on many providers, not an error worth showing.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [visible, client, channel.streamId])

  // The bar has to advance while the page is open, so "now" is state on a minute tick rather than a
  // `Date.now()` read during render (which would also freeze at whatever the first render saw).
  // ponytail: one interval per card with a program — fine for the dozens actually scrolled through; if a
  // 500-channel lineup ever feels heavy, hoist it to a single shared clock in a context.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!program) return
    const timer = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [program])

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
      className="group relative flex items-center gap-3 rounded-card border border-outline-soft bg-surface-container p-3 transition-all duration-200 hover:border-outline-strong hover:bg-surface-high"
    >
      <button data-spatial onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-black/40">
          {channel.streamIcon ? (
            <img
              src={channel.streamIcon}
              alt=""
              loading="lazy"
              className="max-h-10 max-w-10 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <span className="text-xs font-bold text-zinc-500">{channel.name.slice(0, 2).toUpperCase()}</span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-label-md text-white">{channel.name}</span>
            {channel.hasArchive && (
              <span className="shrink-0 rounded border border-outline-strong px-1 text-[10px] font-semibold text-zinc-400">REVER</span>
            )}
          </span>
          {program ? (
            <>
              <span className="mt-0.5 flex items-baseline gap-1.5">
                <span className="truncate text-body-sm text-on-surface-variant">{program.title}</span>
                {endsAt && <span className="shrink-0 text-[11px] text-zinc-500">até {endsAt}</span>}
              </span>
              {progress != null && (
                <span className="mt-1.5 block h-0.5 w-full overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
                </span>
              )}
            </>
          ) : (
            <span className="mt-0.5 block text-xs text-zinc-600">Sem programação</span>
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
        aria-label={isFavorite ? `Remover ${channel.name} dos favoritos` : `Favoritar ${channel.name}`}
        className={`shrink-0 rounded-lg p-2 transition-colors ${
          isFavorite ? 'text-brand-300' : 'text-zinc-600 hover:text-white'
        }`}
      >
        {isFavorite ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>
    </div>
  )
}
