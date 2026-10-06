import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Clock } from '../components/icons'
import { useLiveCatalog } from '../hooks/useCatalog'
import { cached } from '../lib/cache'
import { useXtream } from '../hooks/useXtream'
import { formatEpgTime } from '../hooks/useShortEpg'
import type { EpgProgram, LiveChannel } from '../types'

// Grid window: a couple hours of history (for catch-up) through several hours ahead.
const WINDOW_BEFORE_MS = 2 * 3600_000
const WINDOW_AFTER_MS = 6 * 3600_000
const PX_PER_HOUR = 180

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

  return (
    <div className="min-h-screen pt-[calc(4rem+env(safe-area-inset-top))]">
      <div className="flex items-center gap-3 border-b border-outline-soft px-4 py-3 sm:px-8">
        <button
          onClick={() => navigate('/live')}
          aria-label="Voltar para Ao Vivo"
          className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="font-display text-xl font-bold text-white">Guia de programação</h1>
      </div>

      {loading && channels.length === 0 ? (
        <p className="px-4 py-8 text-center text-zinc-400 sm:px-8">Carregando canais...</p>
      ) : channels.length === 0 ? (
        <p className="px-4 py-8 text-center text-zinc-400 sm:px-8">Nenhum canal nesta categoria.</p>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ width: totalWidth + 140 }}>
            {/* Hour ruler */}
            <div className="sticky top-16 z-10 flex border-b border-outline-soft bg-[#06070c]/95 backdrop-blur-sm">
              <div className="w-[140px] shrink-0" />
              <div className="relative h-8 flex-1">
                {hourMarks.map((m) => (
                  <span key={m.x} className="absolute top-0 border-l border-outline-soft pl-1.5 text-[11px] text-zinc-400" style={{ left: m.x }}>
                    {m.label}
                  </span>
                ))}
              </div>
            </div>

            {channels.map((ch) => {
              const programs = epgByChannel[ch.streamId]
              return (
                <div key={ch.streamId} data-testid={`epg-row-${ch.streamId}`} className="flex border-b border-white/[0.04]">
                  <button
                    onClick={() => navigate(watchUrl(ch))}
                    className="flex w-[140px] shrink-0 items-center gap-2 border-r border-outline-soft bg-[#06070c] px-2.5 py-3 text-left transition-colors hover:bg-white/5"
                  >
                    {ch.streamIcon && <img src={ch.streamIcon} alt="" className="h-6 w-6 shrink-0 object-contain" />}
                    <span className="line-clamp-2 text-xs text-zinc-300">{ch.name}</span>
                  </button>

                  <div className="relative flex-1" style={{ height: 56 }}>
                    {programs === undefined ? (
                      <div className="skeleton absolute inset-y-1.5 left-2 right-2 rounded-md" />
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
                              className={`absolute inset-y-1.5 overflow-hidden rounded-md border px-2 py-1 text-left text-xs transition-colors ${
                                isNow
                                  ? 'border-brand-400/60 bg-brand-500/20 text-white hover:bg-brand-500/30'
                                  : isPast
                                    ? playable
                                      ? 'border-outline-soft bg-surface-container text-zinc-300 hover:bg-surface-high'
                                      : 'cursor-default border-white/5 bg-surface-container/40 text-zinc-600'
                                    : 'cursor-default border-white/5 bg-surface-container text-zinc-400'
                              }`}
                              style={{ left, width }}
                            >
                              <span className="line-clamp-1 font-medium">{p.title}</span>
                              {isPast && p.hasArchive && ch.hasArchive && (
                                <span className="mt-0.5 flex items-center gap-1 text-[10px] text-brand-300">
                                  <Clock className="h-2.5 w-2.5" /> Assistir de novo
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
