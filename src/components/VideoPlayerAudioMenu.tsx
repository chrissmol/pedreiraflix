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
        className="flex items-center gap-1.5 rounded-lg border border-outline-soft bg-black/60 p-2 text-white backdrop-blur-sm transition-colors hover:border-brand-400/40"
      >
        <Languages className="h-4 w-4" />
      </button>
      {open && (
        <div className="glass-panel absolute right-0 mt-1.5 w-40 overflow-hidden rounded-lg text-sm">
          {tracks.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTrack(t.id)}
              className={`block w-full px-3 py-3 text-left transition-colors hover:bg-white/10 active:bg-white/10 ${
                currentTrack === t.id ? 'text-brand-300' : 'text-white'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
