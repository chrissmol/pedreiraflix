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
        className="player-btn"
      >
        <Gauge className="h-4 w-4" />
        {playbackRate !== 1 && <span className="tabular-nums">{playbackRate}x</span>}
      </button>
      {open && (
        <div className="player-panel absolute right-0 mt-2 w-36">
          {PLAYBACK_RATES.map((rate) => (
            <button
              key={rate}
              onClick={() => onSelect(rate)}
              className={`player-option ${playbackRate === rate ? 'player-option-active' : ''}`}
            >
              {rate === 1 ? 'Normal' : `${rate}x`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
