import { Sliders } from './icons'
import type { VideoFit } from '../store/playerPrefs'

const FITS: { value: VideoFit; label: string; hint: string }[] = [
  { value: 'contain', label: 'Ajustar', hint: 'Imagem inteira, com tarjas se precisar' },
  { value: 'cover', label: 'Preencher', hint: 'Sem tarjas, cortando as bordas' },
  { value: 'fill', label: 'Esticar', hint: 'Ocupa tudo, distorcendo a imagem' },
]

const SLEEP_MINUTES = [0, 15, 30, 60, 90]

interface VideoPlayerDisplayMenuProps {
  open: boolean
  onToggle: () => void
  fit: VideoFit
  onSelectFit: (fit: VideoFit) => void
  /** Minutes left on the sleep timer, or null when it is off. */
  sleepRemaining: number | null
  onSelectSleep: (minutes: number) => void
}

/** Proporção da imagem e timer para dormir — os dois ajustes que todo player de IPTV tem e que o
 * navegador não oferece sozinho. Proporção importa porque muito canal é 4:3 ou vem com tarja gravada,
 * e aí "Ajustar" deixa tarja em cima de tarja. */
export function VideoPlayerDisplayMenu({
  open,
  onToggle,
  fit,
  onSelectFit,
  sleepRemaining,
  onSelectSleep,
}: VideoPlayerDisplayMenuProps) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        aria-label="Ajustes de exibição"
        className="player-btn"
      >
        <Sliders className="h-4 w-4" />
        {sleepRemaining != null && <span className="tabular-nums">{sleepRemaining}min</span>}
      </button>
      {open && (
        <div className="menu-panel absolute right-0 mt-2 w-72">
          <p className="menu-label">Proporção</p>
          {FITS.map((option) => (
            <button
              key={option.value}
              onClick={() => onSelectFit(option.value)}
              className={`menu-option ${fit === option.value ? 'menu-option-active' : ''}`}
            >
              <span>
                {option.label}
                <span className="block text-body-sm font-normal text-on-surface-variant">{option.hint}</span>
              </span>
            </button>
          ))}

          <p className="menu-label mt-1 border-t border-outline-soft">
            Desligar em
          </p>
          <div className="flex flex-wrap gap-1.5 p-3 pt-2">
            {SLEEP_MINUTES.map((minutes) => (
              <button
                key={minutes}
                onClick={() => onSelectSleep(minutes)}
                className={`chip ${(minutes === 0 && sleepRemaining == null) || (minutes !== 0 && sleepRemaining === minutes) ? 'bg-brand-fill text-white hover:bg-brand-fill hover:text-white' : ''}`}
              >
                {minutes === 0 ? 'Nunca' : `${minutes}min`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
