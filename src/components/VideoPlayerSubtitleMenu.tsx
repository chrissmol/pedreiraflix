import { Subtitles } from './icons'
import type { SubtitleBackground, SubtitleSize } from '../store/playerPrefs'

interface SubtitleTrack {
  id: number
  name: string
}

interface VideoPlayerSubtitleMenuProps {
  open: boolean
  tracks: SubtitleTrack[]
  currentTrack: number
  subtitleSize: SubtitleSize
  subtitleBackground: SubtitleBackground
  onToggle: () => void
  onSelectTrack: (id: number) => void
  onSelectSize: (size: SubtitleSize) => void
  onSelectBackground: (bg: SubtitleBackground) => void
}

export function VideoPlayerSubtitleMenu({
  open,
  tracks,
  currentTrack,
  subtitleSize,
  subtitleBackground,
  onToggle,
  onSelectTrack,
  onSelectSize,
  onSelectBackground,
}: VideoPlayerSubtitleMenuProps) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        aria-label="Legendas"
        className={`flex items-center gap-1.5 rounded-lg border p-2 backdrop-blur-sm transition-colors ${
          currentTrack !== -1
            ? 'border-brand-400/50 bg-brand-500/20 text-brand-200'
            : 'border-white/10 bg-black/60 text-white hover:border-brand-400/40'
        }`}
      >
        <Subtitles className="h-4 w-4" />
      </button>
      {open && (
        <div className="glass-panel absolute right-0 mt-1.5 w-40 overflow-hidden rounded-lg text-sm">
          <button
            onClick={() => onSelectTrack(-1)}
            className={`block w-full px-3 py-3 text-left transition-colors hover:bg-white/10 active:bg-white/10 ${
              currentTrack === -1 ? 'text-brand-300' : 'text-white'
            }`}
          >
            Desativadas
          </button>
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
          <div className="border-t border-white/10 px-3 py-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Tamanho</p>
            <div className="flex gap-1.5">
              {(['small', 'medium', 'large'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => onSelectSize(size)}
                  aria-label={`Legenda tamanho ${size}`}
                  className={`flex-1 rounded-md border py-1 text-xs transition-colors ${
                    subtitleSize === size ? 'border-brand-400/50 bg-brand-500/20 text-brand-200' : 'border-white/10 text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  {size === 'small' ? 'P' : size === 'medium' ? 'M' : 'G'}
                </button>
              ))}
            </div>
            <p className="mb-1.5 mt-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Fundo</p>
            <div className="flex gap-1.5">
              {([
                ['none', 'Nenhum'],
                ['semi', 'Leve'],
                ['solid', 'Sólido'],
              ] as const).map(([bg, label]) => (
                <button
                  key={bg}
                  onClick={() => onSelectBackground(bg)}
                  className={`flex-1 rounded-md border py-1 text-[11px] transition-colors ${
                    subtitleBackground === bg ? 'border-brand-400/50 bg-brand-500/20 text-brand-200' : 'border-white/10 text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
