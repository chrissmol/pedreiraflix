import { useEffect, useState } from 'react'
import { Info, Play } from './icons'

export interface FeaturedCandidate {
  key: string
  title: string
  description: string | null
  image: string | null
  onPlay: () => void
}

interface HeroCarouselProps {
  /** Already built as the final movie/series-alternating, rating-sorted sequence — see HomePage.tsx. */
  items: FeaturedCandidate[]
  /** How long each item stays featured before the slot moves to the next one. Real wall-clock time, not
   * a timer that starts over on every reload — reopening the app mid-window shows the same title it
   * would've shown if you'd left the tab open the whole time. */
  slotMs?: number
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

// Lets e2e tests use a millisecond-scale slot instead of waiting 4h for real; never set outside a test
// harness, so this is a no-op in the real app — same pattern as AutoLogout's override.
function resolveSlotMs(fallback: number): number {
  const override = (typeof window !== 'undefined' && (window as { __HERO_SLOT_MS_OVERRIDE__?: number }).__HERO_SLOT_MS_OVERRIDE__) || 0
  return override || fallback
}

/** Rotating hero, restricted to the household's "only the very best" bar (≥8.5 — filtered by the caller)
 * and alternating movie/series: which title is "now" is computed straight from the wall clock (a stable
 * slot index into the sequence), not a running timer, so it survives reloads and new tabs consistently.
 * No manual dot navigation on purpose — it's meant to just show one pick at a time, not advertise how
 * many titles qualify. If a poster image actually fails to load (dead URL, blocked host, broken provider)
 * it's excluded and the slot recomputes over what's left, instead of just sitting there broken. */
export default function HeroCarousel({ items, slotMs = FOUR_HOURS_MS }: HeroCarouselProps) {
  slotMs = resolveSlotMs(slotMs)
  const [now, setNow] = useState(() => Date.now())
  const [broken, setBroken] = useState<Set<string>>(new Set())

  // Rechecks often enough to catch the slot boundary even with a tiny test override, without polling
  // wastefully during the real 4h window.
  useEffect(() => {
    const recheckMs = Math.max(1000, Math.min(5 * 60 * 1000, Math.floor(slotMs / 10)))
    const timer = setInterval(() => setNow(Date.now()), recheckMs)
    return () => clearInterval(timer)
  }, [slotMs])

  const playable = items.filter((it) => !broken.has(it.key))
  const timeSlot = playable.length > 0 ? Math.floor(now / slotMs) % playable.length : 0
  const index = timeSlot % Math.max(1, playable.length)
  const current = playable[index]

  if (!current) return null

  return (
    <div className="relative h-[60vw] max-h-[680px] min-h-[420px] w-full overflow-hidden">
      {current.image && (
        <img
          key={current.key}
          src={current.image}
          alt={current.title}
          className="absolute inset-0 h-full w-full object-cover object-top"
          onError={() => setBroken((prev) => new Set(prev).add(current.key))}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#06070c] via-[#06070c]/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#06070c]/90 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
      <div className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-brand-500/20 blur-[100px]" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 px-4 pb-10 sm:px-10 sm:pb-16">
        <h1 className="font-display max-w-xl text-3xl font-extrabold tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] sm:text-5xl">
          {current.title}
        </h1>
        {current.description && (
          <p className="line-clamp-3 max-w-lg text-sm text-zinc-300 drop-shadow sm:text-base">{current.description}</p>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={current.onPlay}
            className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-black shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_10px_30px_-8px_rgba(15,123,255,0.5)] transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_14px_40px_-8px_rgba(15,123,255,0.75)] sm:px-6 sm:text-base"
          >
            <Play className="h-5 w-5" /> Assistir
          </button>
          <button
            onClick={current.onPlay}
            className="glass-panel flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:border-brand-400/40 hover:bg-white/10 sm:px-6 sm:text-base"
          >
            <Info className="h-5 w-5" /> Detalhes
          </button>
        </div>
      </div>
    </div>
  )
}
