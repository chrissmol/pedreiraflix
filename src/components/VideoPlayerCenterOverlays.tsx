import { Pause, Play, SkipNext, SkipSeconds, VolumeMute } from './icons'
import { SKIP_SECONDS } from './videoPlayerUtils'

interface NextEpisode {
  label: string
  onPlay: () => void
}

interface VideoPlayerCenterOverlaysProps {
  error: string | null
  nextUpVisible: boolean
  next: NextEpisode | null | undefined
  onPlayNext: () => void
  onDismissNextUp: () => void
  seekFlash: { side: -1 | 1; key: number } | null
  buffering: boolean
  downloadedPct: number | null
  showSlowHint: boolean
  needsUnmutePrompt: boolean
  onUnmute: () => void
  isPlaying: boolean
  isLive: boolean
  controlsVisible: boolean
  onTogglePlay: () => void
  onSkip: (seconds: number) => void
  onRetry: () => void
}

export function VideoPlayerCenterOverlays({
  error,
  nextUpVisible,
  next,
  onPlayNext,
  onDismissNextUp,
  seekFlash,
  buffering,
  downloadedPct,
  showSlowHint,
  needsUnmutePrompt,
  onUnmute,
  isPlaying,
  isLive,
  controlsVisible,
  onTogglePlay,
  onSkip,
  onRetry,
}: VideoPlayerCenterOverlaysProps) {
  return (
    <>
      {nextUpVisible && next && !error && (
        <div data-controls className="absolute bottom-24 right-3 z-20 sm:bottom-28 sm:right-6">
          <div className="menu-panel flex w-72 flex-col gap-2 p-4">
            <p className="text-label-badge uppercase tracking-wider text-brand-400">A seguir</p>
            <p className="truncate text-label-md text-white">{next.label}</p>
            <div className="flex gap-2">
              <button
                onClick={onPlayNext}
                className="btn-primary h-10 flex-1 px-4 sm:px-4"
              >
                <SkipNext className="h-4 w-4" /> Reproduzir
              </button>
              <button
                onClick={onDismissNextUp}
                className="btn-secondary h-10 px-4 sm:px-4"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {seekFlash && (
        <div
          key={seekFlash.key}
          className={`pointer-events-none absolute inset-y-0 z-10 flex w-1/3 items-center justify-center bg-white/10 text-headline-sm text-white ${
            seekFlash.side === -1 ? 'left-0 rounded-r-[100%]' : 'right-0 rounded-l-[100%]'
          }`}
        >
          {seekFlash.side === -1 ? '−10s' : '+10s'}
        </div>
      )}

      {buffering && !error && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-outline-strong border-t-brand-400" />
          {downloadedPct !== null && (
            <p className="rounded-full bg-black/60 px-3 py-1.5 text-label-md text-white backdrop-blur-md tabular-nums">
              {downloadedPct}%
            </p>
          )}
          {showSlowHint && (
            <p className="rounded-full bg-black/60 px-3 py-1.5 text-body-sm text-on-surface-variant backdrop-blur-md">
              Conexão lenta com o servidor — ainda carregando...
            </p>
          )}
        </div>
      )}

      {needsUnmutePrompt && !error && (
        <button
          data-controls
          onClick={onUnmute}
          className="player-btn absolute left-3 top-20 z-20 px-4"
        >
          <VolumeMute className="h-4 w-4" /> Ativar som
        </button>
      )}

      {/* Mouse: just an icon while paused (click anywhere toggles). */}
      {!buffering && !isPlaying && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center pointer-coarse:hidden">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500 shadow-[0_12px_28px_-6px_rgba(15,123,255,0.5)]">
            <Play className="ml-1 h-8 w-8 text-white" />
          </div>
        </div>
      )}

      {/* Touch: big tappable play/pause with ±10s, shown together with the controls. */}
      {!buffering && !error && (
        <div
          className={`pointer-events-none absolute inset-0 z-10 hidden items-center justify-center gap-10 transition-opacity duration-200 pointer-coarse:flex ${
            controlsVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {!isLive && (
            <button
              data-controls
              onClick={() => onSkip(-SKIP_SECONDS)}
              aria-label="Voltar 10s"
              className={`rounded-full bg-black/45 p-3.5 text-white backdrop-blur-md active:bg-white/20 ${controlsVisible ? 'pointer-events-auto' : ''}`}
            >
              <SkipSeconds direction="back" seconds={SKIP_SECONDS} className="h-8 w-8" />
            </button>
          )}
          <button
            data-controls
            onClick={onTogglePlay}
            aria-label="Play/Pause"
            className={`rounded-full bg-brand-500 p-5 text-white shadow-[0_12px_28px_-6px_rgba(15,123,255,0.5)] active:scale-95 ${controlsVisible ? 'pointer-events-auto' : ''}`}
          >
            {isPlaying ? <Pause className="h-9 w-9" /> : <Play className="ml-0.5 h-9 w-9" />}
          </button>
          {!isLive && (
            <button
              data-controls
              onClick={() => onSkip(SKIP_SECONDS)}
              aria-label="Avançar 10s"
              className={`rounded-full bg-black/45 p-3.5 text-white backdrop-blur-md active:bg-white/20 ${controlsVisible ? 'pointer-events-auto' : ''}`}
            >
              <SkipSeconds direction="forward" seconds={SKIP_SECONDS} className="h-8 w-8" />
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface/95 px-6 text-center text-body-md text-red-200">
          <p className="max-w-xs">{error}</p>
          <button
            onClick={onRetry}
            className="btn-primary"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </>
  )
}
