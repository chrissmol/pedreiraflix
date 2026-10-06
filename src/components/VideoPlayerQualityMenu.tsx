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
        className="flex items-center gap-1.5 rounded-lg border border-outline-soft bg-black/60 px-3 py-2 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:border-brand-400/40"
      >
        <Settings className="h-4 w-4" />
        {currentLevel === -1 ? `Auto${autoPickedHeight ? ` (${autoPickedHeight}p)` : ''}` : `${levels.find((l) => l.index === currentLevel)?.height}p`}
      </button>
      {open && (
        <div className="glass-panel absolute right-0 mt-1.5 w-36 overflow-hidden rounded-lg text-sm">
          <button
            onClick={() => onSelect(-1)}
            className={`block w-full px-3 py-3 text-left transition-colors hover:bg-white/10 active:bg-white/10 ${
              currentLevel === -1 ? 'text-brand-300' : 'text-white'
            }`}
          >
            Automático
          </button>
          {[...levels]
            .sort((a, b) => b.height - a.height)
            .map((lvl) => (
              <button
                key={lvl.index}
                onClick={() => onSelect(lvl.index)}
                className={`block w-full px-3 py-3 text-left transition-colors hover:bg-white/10 active:bg-white/10 ${
                  currentLevel === lvl.index ? 'text-brand-300' : 'text-white'
                }`}
              >
                {lvl.height}p
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
