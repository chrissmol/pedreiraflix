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
        className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/60 px-2 py-2 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:border-brand-400/40"
      >
        <Sliders className="h-4 w-4" />
        {sleepRemaining != null && <span className="tabular-nums">{sleepRemaining}min</span>}
      </button>
      {open && (
        <div className="glass-panel absolute right-0 mt-1.5 w-60 overflow-hidden rounded-lg text-sm">
          <p className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Proporção</p>
          {FITS.map((option) => (
            <button
              key={option.value}
              onClick={() => onSelectFit(option.value)}
              className={`block w-full px-3 py-2.5 text-left transition-colors hover:bg-white/10 active:bg-white/10 ${
                fit === option.value ? 'text-brand-300' : 'text-white'
              }`}
            >
              {option.label}
              <span className="block text-xs text-zinc-400">{option.hint}</span>
            </button>
          ))}

          <p className="border-t border-white/10 px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Desligar em
          </p>
          <div className="flex flex-wrap gap-1.5 p-3 pt-2">
            {SLEEP_MINUTES.map((minutes) => (
              <button
                key={minutes}
                onClick={() => onSelectSleep(minutes)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  (minutes === 0 && sleepRemaining == null) || (minutes !== 0 && sleepRemaining === minutes)
                    ? 'border-brand-400/50 bg-brand-500/15 text-brand-200'
                    : 'border-zinc-700 text-zinc-300 hover:border-brand-500/40 hover:text-white'
                }`}
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
