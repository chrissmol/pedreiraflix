import { Settings } from './icons'

export interface QualityLevel {
  index: number
  height: number
  bitrate: number
}

interface VideoPlayerQualityMenuProps {
  open: boolean
  levels: QualityLevel[]
  currentLevel: number
  autoPickedHeight: number | null
  onToggle: () => void
  onSelect: (index: number) => void
}

export function VideoPlayerQualityMenu({
  open,
  levels,
  currentLevel,
  autoPickedHeight,
  onToggle,
  onSelect,
}: VideoPlayerQualityMenuProps) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="player-btn"
      >
        <Settings className="h-4 w-4" />
        {currentLevel === -1 ? `Auto${autoPickedHeight ? ` (${autoPickedHeight}p)` : ''}` : `${levels.find((l) => l.index === currentLevel)?.height}p`}
      </button>
      {open && (
        <div className="player-panel absolute right-0 mt-2 w-44">
          <button
            onClick={() => onSelect(-1)}
            className={`player-option ${currentLevel === -1 ? 'player-option-active' : ''}`}
          >
            Automático
          </button>
          {[...levels]
            .sort((a, b) => b.height - a.height)
            .map((lvl) => (
              <button
                key={lvl.index}
                onClick={() => onSelect(lvl.index)}
                className={`player-option ${currentLevel === lvl.index ? 'player-option-active' : ''}`}
              >
                {lvl.height}p
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
