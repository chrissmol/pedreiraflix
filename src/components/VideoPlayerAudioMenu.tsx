import { Languages } from './icons'

interface AudioTrack {
  id: number
  name: string
}

interface VideoPlayerAudioMenuProps {
  open: boolean
  tracks: AudioTrack[]
  currentTrack: number
  onToggle: () => void
  onSelectTrack: (id: number) => void
}

export function VideoPlayerAudioMenu({ open, tracks, currentTrack, onToggle, onSelectTrack }: VideoPlayerAudioMenuProps) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        aria-label="Áudio"
        className="player-btn"
      >
        <Languages className="h-4 w-4" />
      </button>
      {open && (
        <div className="menu-panel absolute right-0 mt-2 w-56">
          {tracks.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTrack(t.id)}
              className={`menu-option ${currentTrack === t.id ? 'menu-option-active' : ''}`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
