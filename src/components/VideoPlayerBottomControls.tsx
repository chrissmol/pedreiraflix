import { Maximize, Minimize, Pause, Play, SkipBack, SkipForward, SkipNext, VolumeHigh, VolumeMute, Zap } from './icons'
import { formatTime } from './videoPlayerUtils'

interface VideoPlayerBottomControlsProps {
  controlsVisible: boolean
  isLive: boolean
  usingHlsJs: boolean
  fastLive: boolean
  onToggleFastLive: () => void
  duration: number
  currentTime: number
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void
  isPlaying: boolean
  onTogglePlay: () => void
  onSkip: (seconds: number) => void
  isMuted: boolean
  volume: number
  onToggleMute: () => void
  onVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  hasNext: boolean
  onPlayNext: () => void
  fsSupported: boolean
  isFullscreen: boolean
  onToggleFullscreen: () => void
}

export function VideoPlayerBottomControls({
  controlsVisible,
  isLive,
  usingHlsJs,
  fastLive,
  onToggleFastLive,
  duration,
  currentTime,
  onSeek,
  isPlaying,
  onTogglePlay,
  onSkip,
  isMuted,
  volume,
  onToggleMute,
  onVolumeChange,
  hasNext,
  onPlayNext,
  fsSupported,
  isFullscreen,
  onToggleFullscreen,
}: VideoPlayerBottomControlsProps) {
  return (
    <div
      data-controls
      className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/60 to-transparent pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-10 sm:px-6 transition-opacity duration-200 ${
        controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {isLive ? (
        <div className="mb-2 flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-live px-2.5 py-1 text-label-badge font-bold tracking-wider text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            AO VIVO
          </span>
          {usingHlsJs && (
            <button
              onClick={onToggleFastLive}
              aria-pressed={fastLive}
              title="Menos delay, mais risco de travar em picos do provedor"
              className={`chip flex items-center gap-1 py-1 ${fastLive ? 'bg-brand-500/25 text-brand-300' : ''}`}
            >
              <Zap className="h-3 w-3" /> Rápido
            </button>
          )}
        </div>
      ) : (
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={onSeek}
          aria-label="Progresso"
          style={{ '--pct': `${duration ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties}
          className="player-range mb-2 w-full"
        />
      )}

      {/* Touch hides the buttons the center cluster already has, and the volume (phones use the hardware keys). */}
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={onTogglePlay}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-[0_12px_28px_-6px_rgba(15,123,255,0.5)] transition-transform hover:scale-105 active:scale-95 pointer-coarse:hidden"
          aria-label="Play/Pause"
        >
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
        </button>

        {!isLive && (
          <>
            <button onClick={() => onSkip(-10)} className="player-btn bg-transparent pointer-coarse:hidden" aria-label="Voltar 10s">
              <SkipBack className="h-5 w-5" />
            </button>
            <button onClick={() => onSkip(10)} className="player-btn bg-transparent pointer-coarse:hidden" aria-label="Avançar 10s">
              <SkipForward className="h-5 w-5" />
            </button>
          </>
        )}

        <div className="flex items-center gap-2 pointer-coarse:hidden">
          <button onClick={onToggleMute} className="player-btn bg-transparent" aria-label="Mudo">
            {isMuted || volume === 0 ? <VolumeMute className="h-5 w-5" /> : <VolumeHigh className="h-5 w-5" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={onVolumeChange}
            aria-label="Volume"
            style={{ '--pct': `${(isMuted ? 0 : volume) * 100}%` } as React.CSSProperties}
            className="player-range w-16 shrink-0 sm:w-24"
          />
        </div>

        {!isLive && (
          <span className="ml-1 whitespace-nowrap text-body-sm tabular-nums text-white">
            {formatTime(currentTime)} <span className="text-on-surface-muted">/ {formatTime(duration)}</span>
            {duration > 0 && (
              <span className="hidden text-on-surface-muted sm:inline"> (-{formatTime(Math.max(0, duration - currentTime))})</span>
            )}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {hasNext && !isLive && (
            <button
              onClick={onPlayNext}
              aria-label="Próximo episódio"
              title="Próximo episódio"
              className="player-btn bg-transparent pointer-coarse:hidden"
            >
              <SkipNext className="h-5 w-5" />
            </button>
          )}
          {fsSupported && (
            <button onClick={onToggleFullscreen} className="player-btn bg-transparent" aria-label="Tela cheia">
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
