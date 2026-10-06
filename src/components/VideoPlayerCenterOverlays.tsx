import { Pause, Play, SkipBack, SkipForward, SkipNext, VolumeMute } from './icons'

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
          <div className="glass-panel glow-border flex w-64 flex-col gap-2 rounded-xl p-3">
            <p className="text-xs text-on-surface-variant">A seguir</p>
            <p className="truncate text-sm font-semibold text-white">{next.label}</p>
            <div className="flex gap-2">
              <button
                onClick={onPlayNext}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-700 py-2 text-xs font-bold text-white hover:brightness-110"
              >
                <SkipNext className="h-4 w-4" /> Reproduzir
              </button>
              <button
                onClick={onDismissNextUp}
                className="rounded-lg border border-outline-soft px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10"
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
          className={`pointer-events-none absolute inset-y-0 z-10 flex w-1/3 items-center justify-center bg-white/10 text-sm font-bold text-white ${
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
            <p className="rounded-lg bg-black/60 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm tabular-nums">
              {downloadedPct}%
            </p>
          )}
          {showSlowHint && (
            <p className="rounded-lg bg-black/60 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur-sm">
              Conexão lenta com o servidor — ainda carregando...
            </p>
          )}
        </div>
      )}

      {needsUnmutePrompt && !error && (
        <button
          data-controls
          onClick={onUnmute}
          className="glass-panel absolute left-3 top-20 z-20 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-brand-400/40"
        >
          <VolumeMute className="h-4 w-4" /> Ativar som
        </button>
      )}

      {/* Mouse: just an icon while paused (click anywhere toggles). */}
      {!buffering && !isPlaying && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center pointer-coarse:hidden">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
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
              onClick={() => onSkip(-10)}
              aria-label="Voltar 10s"
              className={`rounded-full bg-black/40 p-3 text-white backdrop-blur-sm active:bg-black/60 ${controlsVisible ? 'pointer-events-auto' : ''}`}
            >
              <SkipBack className="h-6 w-6" />
            </button>
          )}
          <button
            data-controls
            onClick={onTogglePlay}
            aria-label="Play/Pause"
            className={`rounded-full bg-black/40 p-5 text-white backdrop-blur-sm active:bg-black/60 ${controlsVisible ? 'pointer-events-auto' : ''}`}
          >
            {isPlaying ? <Pause className="h-9 w-9" /> : <Play className="ml-0.5 h-9 w-9" />}
          </button>
          {!isLive && (
            <button
              data-controls
              onClick={() => onSkip(10)}
              aria-label="Avançar 10s"
              className={`rounded-full bg-black/40 p-3 text-white backdrop-blur-sm active:bg-black/60 ${controlsVisible ? 'pointer-events-auto' : ''}`}
            >
              <SkipForward className="h-6 w-6" />
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 text-center text-sm text-rose-300">
          <p className="max-w-xs">{error}</p>
          <button
            onClick={onRetry}
            className="glow-border rounded-lg bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </>
  )
}
