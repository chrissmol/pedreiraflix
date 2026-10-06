import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Calendar, ChevronLeft, Clock } from '../components/icons'
import { useLiveCatalog } from '../hooks/useCatalog'
import { cached } from '../lib/cache'
import { useXtream } from '../hooks/useXtream'
import { formatEpgTime } from '../hooks/useShortEpg'
import type { EpgProgram, LiveChannel } from '../types'

// Grid window: a couple hours of history (for catch-up) through several hours ahead.
const WINDOW_BEFORE_MS = 2 * 3600_000
const WINDOW_AFTER_MS = 6 * 3600_000
const PX_PER_HOUR = 200
// Coluna de canais mais estreita no celular, onde cada pixel de grade conta.
const channelCol = () => (window.innerWidth < 640 ? 116 : 168)

function watchUrl(ch: LiveChannel, program?: EpgProgram, now = Date.now()) {
  const base = `/watch/live/${ch.streamId}?name=${encodeURIComponent(ch.name)}`
  if (!program?.startTimestamp || !program.endTimestamp) return base
  const isPast = program.endTimestamp * 1000 <= now
  if (!isPast) return base // live or future: future isn't playable, just jump to live
  const durationMinutes = (program.endTimestamp - program.startTimestamp) / 60
  return `${base}&start=${program.startTimestamp}&duration=${Math.ceil(durationMinutes)}`
}

export default function EpgGuidePage() {
  const navigate = useNavigate()
  const client = useXtream()
  const [params] = useSearchParams()
  const categoryId = params.get('category')
  const { groups, loading } = useLiveCatalog()
  const [now, setNow] = useState(Date.now())

  const channels = useMemo(() => {
    const scoped = categoryId ? groups.filter((g) => g.category.categoryId === categoryId) : groups
    return scoped.flatMap((g) => g.items)
  }, [groups, categoryId])

  const [epgByChannel, setEpgByChannel] = useState<Record<number, EpgProgram[]>>({})
  useEffect(() => {
    if (!client || channels.length === 0) return
    let cancelled = false
    // Sequential-ish via the shared client queue (see lib/requestQueue.ts) — fine here since the guide is
    // an explicit, opt-in view, not something loaded on every visit to Ao Vivo.
    Promise.all(
      channels.map(async (ch) => {
        try {
          const epg = await cached(`epg-full:${ch.streamId}`, () => client.getFullEpg(ch.streamId))
          if (!cancelled) setEpgByChannel((prev) => ({ ...prev, [ch.streamId]: epg }))
        } catch {
          // One channel's EPG failing (provider hiccup) shouldn't blank out the rest of the grid.
        }
      }),
    )
    return () => {
      cancelled = true
    }
  }, [client, channels])

  // Keeps the "now" line moving and (once a minute) re-derives which program is "current" without a full reload.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const windowStart = now - WINDOW_BEFORE_MS
  const windowEnd = now + WINDOW_AFTER_MS
  const windowHours = (windowEnd - windowStart) / 3600_000
  const totalWidth = windowHours * PX_PER_HOUR

  function xFor(ts: number) {
    return Math.max(0, ((ts - windowStart) / (windowEnd - windowStart)) * totalWidth)
  }

  const hourMarks = useMemo(() => {
    const marks: { x: number; label: string }[] = []
    const start = new Date(Math.ceil(windowStart / 3600_000) * 3600_000)
    for (let t = start.getTime(); t < windowEnd; t += 3600_000) {
      marks.push({ x: xFor(t), label: new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) })
    }
    return marks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowStart, windowEnd])

  // Abre ja no "agora" (como no Stitch), deixando ~1h de historico visivel a esquerda para o catch-up.
  const gridRef = useRef<HTMLDivElement>(null)
  const scrolledToNow = useRef(false)
  const hasChannels = channels.length > 0
  const CHANNEL_COL = channelCol()
  useEffect(() => {
    if (!hasChannels || scrolledToNow.current || !gridRef.current) return
    scrolledToNow.current = true
    gridRef.current.scrollLeft = Math.max(0, xFor(now) - (window.innerWidth < 640 ? PX_PER_HOUR / 6 : PX_PER_HOUR))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChannels])

  return (
    <div className="flex h-full flex-col pt-[calc(4rem+env(safe-area-inset-top))]">
      <div className="flex items-center gap-3 px-4 py-4 sm:px-10">
        <button onClick={() => navigate('/live')} aria-label="Voltar para Ao Vivo" className="btn-icon h-10 w-10">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <Calendar className="h-6 w-6 text-brand-400" />
        <h1 className="font-display text-headline-md text-white">Guia de programação</h1>
      </div>

      {loading && channels.length === 0 ? (
        <p className="px-4 py-8 text-center text-on-surface-variant sm:px-10">Carregando canais...</p>
      ) : channels.length === 0 ? (
        <p className="px-4 py-8 text-center text-on-surface-variant sm:px-10">Nenhum canal nesta categoria.</p>
      ) : (
        // O grid e a propria area de rolagem (nos dois eixos): so assim a regua de horas gruda no topo e a
        // coluna de canais na esquerda. Antes a regua era sticky em relacao a pagina, mas morava dentro de
        // um overflow-x — e acabava deslocada 64px para dentro do grid, por cima da primeira linha.
        <div ref={gridRef} className="mx-4 mb-4 min-h-0 flex-1 overflow-auto rounded-2xl border border-outline-soft bg-surface-lowest sm:mx-10 sm:mb-6">
          <div className="relative" style={{ width: totalWidth + CHANNEL_COL }}>
            {/* Hour ruler */}
            <div className="sticky top-0 z-20 flex border-b border-outline-soft bg-surface-lowest/95 backdrop-blur-md">
              <div className="sticky left-0 z-10 shrink-0 bg-surface-lowest" style={{ width: CHANNEL_COL }} />
              <div className="relative h-10 flex-1">
                {hourMarks.map((m) => (
                  <span
                    key={m.x}
                    className="absolute top-0 flex h-full items-center border-l border-outline-soft pl-2 text-label-badge text-on-surface-variant"
                    style={{ left: m.x }}
                  >
                    {m.label}
                  </span>
                ))}
                <span
                  className="absolute top-0 flex h-full items-center gap-1.5 pl-2 text-label-badge font-semibold text-brand-400"
                  style={{ left: xFor(now) }}
                >
                  <span className="h-2 w-2 rounded-full bg-brand-500" /> Agora
                </span>
              </div>
            </div>

            {/* Linha do "agora" atravessando todos os canais */}
            <div
              className="pointer-events-none absolute bottom-0 top-10 z-10 w-0.5 bg-brand-500/70 shadow-[0_0_12px_rgba(15,123,255,0.6)]"
              style={{ left: CHANNEL_COL + xFor(now) }}
            />

            {channels.map((ch) => {
              const programs = epgByChannel[ch.streamId]
              return (
                <div key={ch.streamId} data-testid={`epg-row-${ch.streamId}`} className="flex border-b border-outline-soft/60">
                  <button
                    onClick={() => navigate(watchUrl(ch))}
                    style={{ width: CHANNEL_COL }}
                    className="sticky left-0 z-10 flex shrink-0 items-center gap-2.5 border-r border-outline-soft bg-surface-low px-3 py-3 text-left transition-colors hover:bg-surface-container"
                  >
                    {ch.streamIcon && <img src={ch.streamIcon} alt="" className="h-7 w-7 shrink-0 rounded-md object-contain sm:h-8 sm:w-8" />}
                    <span className="line-clamp-2 text-body-sm font-medium text-white sm:text-label-md">{ch.name}</span>
                  </button>

                  <div className="relative flex-1" style={{ height: 68 }}>
                    {programs === undefined ? (
                      <div className="skeleton absolute inset-y-1.5 left-2 right-2 rounded-xl" />
                    ) : (
                      programs
                        // The API's timestamps are Unix seconds; windowStart/windowEnd (and `now`) are
                        // milliseconds throughout the rest of this component — converted once here.
                        .map((p) => ({
                          p,
                          start: p.startTimestamp != null ? p.startTimestamp * 1000 : windowStart,
                          end: p.endTimestamp != null ? p.endTimestamp * 1000 : windowEnd,
                        }))
                        .filter(({ end, start }) => end > windowStart && start < windowEnd)
                        .map(({ p, start, end }) => {
                          const left = xFor(start)
                          const width = Math.max(24, xFor(end) - left)
                          const isNow = start <= now && now < end
                          const isPast = end <= now
                          const playable = isNow || (isPast && p.hasArchive && ch.hasArchive)
                          return (
                            <button
                              key={p.id}
                              disabled={!playable}
                              onClick={() => navigate(watchUrl(ch, p, now))}
                              title={`${formatEpgTime(p.start)}–${formatEpgTime(p.end)} · ${p.title}${p.description ? `\n${p.description}` : ''}`}
                              className={`absolute inset-y-1.5 overflow-hidden rounded-xl px-3 py-1.5 text-left transition-colors ${
                                isNow
                                  ? 'border-b-2 border-brand-500 bg-surface-high text-white hover:bg-surface-highest'
                                  : isPast
                                    ? playable
                                      ? 'bg-surface-container text-on-surface-variant hover:bg-surface-high hover:text-white'
                                      : 'cursor-default bg-surface-low/60 text-on-surface-muted'
                                    : 'cursor-default bg-surface-container text-on-surface-variant'
                              }`}
                              style={{ left: left + 2, width: width - 4 }}
                            >
                              <span className="flex items-center gap-2">
                                <span className="line-clamp-1 text-label-md">{p.title}</span>
                                {isNow && width > 160 && (
                                  <span className="ml-auto shrink-0 rounded bg-live px-1.5 py-0.5 text-label-badge font-bold text-white">NO AR</span>
                                )}
                              </span>
                              {isPast && p.hasArchive && ch.hasArchive ? (
                                <span className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-label-badge text-brand-300">
                                  <Clock className="h-3 w-3" /> Assistir de novo
                                </span>
                              ) : (
                                <span className="mt-0.5 block truncate text-label-badge text-on-surface-muted">
                                  {formatEpgTime(p.start)}–{formatEpgTime(p.end)}
                                </span>
                              )}
                            </button>
                          )
                        })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
