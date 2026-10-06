import { Gauge } from './icons'
import { PLAYBACK_RATES } from './videoPlayerUtils'

interface VideoPlayerSpeedMenuProps {
  open: boolean
  playbackRate: number
  onToggle: () => void
  onSelect: (rate: number) => void
}

export function VideoPlayerSpeedMenu({ open, playbackRate, onToggle, onSelect }: VideoPlayerSpeedMenuProps) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        aria-label="Velocidade"
        className="flex items-center gap-1 rounded-lg border border-outline-soft bg-black/60 px-2 py-2 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:border-brand-400/40"
      >
        <Gauge className="h-4 w-4" />
        {playbackRate !== 1 && <span className="tabular-nums">{playbackRate}x</span>}
      </button>
      {open && (
        <div className="glass-panel absolute right-0 mt-1.5 w-28 overflow-hidden rounded-lg text-sm">
          {PLAYBACK_RATES.map((rate) => (
            <button
              key={rate}
              onClick={() => onSelect(rate)}
              className={`block w-full px-3 py-3 text-left transition-colors hover:bg-white/10 active:bg-white/10 ${
                playbackRate === rate ? 'text-brand-300' : 'text-white'
              }`}
            >
              {rate === 1 ? 'Normal' : `${rate}x`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
