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
  /** Segundos somados as cues: positivo atrasa a legenda, negativo adianta. */
  offset: number
  onChangeOffset: (seconds: number) => void
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
  offset,
  onChangeOffset,
}: VideoPlayerSubtitleMenuProps) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        aria-label="Legendas"
        className={`player-btn ${currentTrack !== -1 ? 'player-btn-active' : ''}`}
      >
        <Subtitles className="h-4 w-4" />
      </button>
      {open && (
        <div className="menu-panel absolute right-0 mt-2 w-56">
          <button
            onClick={() => onSelectTrack(-1)}
            className={`menu-option ${currentTrack === -1 ? 'menu-option-active' : ''}`}
          >
            Desativadas
          </button>
          {tracks.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTrack(t.id)}
              className={`menu-option ${currentTrack === t.id ? 'menu-option-active' : ''}`}
            >
              {t.name}
            </button>
          ))}
          <div className="mt-1 border-t border-outline-soft px-3 py-3">
            <p className="mb-1.5 text-label-badge uppercase tracking-wider text-on-surface-muted">Tamanho</p>
            <div className="flex gap-1.5">
              {(['small', 'medium', 'large'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => onSelectSize(size)}
                  aria-label={`Legenda tamanho ${size}`}
                  className={`chip flex-1 ${subtitleSize === size ? 'bg-brand-500 text-white hover:bg-brand-500 hover:text-white' : ''}`}
                >
                  {size === 'small' ? 'P' : size === 'medium' ? 'M' : 'G'}
                </button>
              ))}
            </div>
            <p className="mb-1.5 mt-3 text-label-badge uppercase tracking-wider text-on-surface-muted">Fundo</p>
            <div className="flex gap-1.5">
              {([
                ['none', 'Nenhum'],
                ['semi', 'Leve'],
                ['solid', 'Sólido'],
              ] as const).map(([bg, label]) => (
                <button
                  key={bg}
                  onClick={() => onSelectBackground(bg)}
                  className={`chip flex-1 ${subtitleBackground === bg ? 'bg-brand-500 text-white hover:bg-brand-500 hover:text-white' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* So a legenda da para sincronizar: nao existe API no navegador para deslocar o audio de um
                <video>, e fazer isso pelo Web Audio quebraria AirPlay e Chromecast. */}
            <p className="mt-3 text-label-badge uppercase tracking-wider text-on-surface-muted">Sincronia</p>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                onClick={() => onChangeOffset(Math.round((offset - 0.5) * 10) / 10)}
                aria-label="Adiantar legenda 0,5s"
                className="chip"
              >
                -0,5s
              </button>
              <span className="flex-1 text-center text-xs tabular-nums text-white">
                {offset === 0 ? 'Em sincronia' : `${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`}
              </span>
              <button
                onClick={() => onChangeOffset(Math.round((offset + 0.5) * 10) / 10)}
                aria-label="Atrasar legenda 0,5s"
                className="chip"
              >
                +0,5s
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
