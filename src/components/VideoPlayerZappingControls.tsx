import { ChevronDown, ChevronUp } from './icons'

interface VideoPlayerZappingControlsProps {
  isLive: boolean
  controlsVisible: boolean
  error: string | null
  onChannelUp?: () => void
  onChannelDown?: () => void
}

export function VideoPlayerZappingControls({
  isLive,
  controlsVisible,
  error,
  onChannelUp,
  onChannelDown,
}: VideoPlayerZappingControlsProps) {
  if (!isLive || (!onChannelUp && !onChannelDown) || error) return null

  return (
    <div
      data-controls
      className={`absolute right-2 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 transition-opacity duration-200 sm:right-4 ${
        controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <button
        onClick={onChannelUp}
        disabled={!onChannelUp}
        aria-label="Próximo canal"
        title="Próximo canal (↑)"
        className="player-btn h-11 w-11 disabled:opacity-30"
      >
        <ChevronUp className="h-5 w-5" />
      </button>
      <button
        onClick={onChannelDown}
        disabled={!onChannelDown}
        aria-label="Canal anterior"
        title="Canal anterior (↓)"
        className="player-btn h-11 w-11 disabled:opacity-30"
      >
        <ChevronDown className="h-5 w-5" />
      </button>
    </div>
  )
}
