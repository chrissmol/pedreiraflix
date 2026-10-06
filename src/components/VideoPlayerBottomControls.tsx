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
      className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-8 transition-opacity duration-200 ${
        controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {isLive ? (
        <div className="mb-2 flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-400" />
          <span className="text-xs font-bold tracking-wide text-white">AO VIVO</span>
          {usingHlsJs && (
            <button
              onClick={onToggleFastLive}
              aria-pressed={fastLive}
              title="Menos delay, mais risco de travar em picos do provedor"
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                fastLive ? 'border-brand-400/60 bg-brand-500/20 text-brand-300' : 'border-white/15 text-on-surface-variant hover:text-white'
              }`}
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
          className="mb-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-brand-500 pointer-coarse:h-2"
        />
      )}

      {/* Touch hides the buttons the center cluster already has, and the volume (phones use the hardware keys). */}
      <div className="flex items-center gap-2">
        <button onClick={onTogglePlay} className="rounded-full p-1.5 text-white transition-transform hover:scale-110 pointer-coarse:hidden" aria-label="Play/Pause">
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
        </button>

        {!isLive && (
          <>
            <button onClick={() => onSkip(-10)} className="rounded-full p-1.5 text-white transition-transform hover:scale-110 pointer-coarse:hidden" aria-label="Voltar 10s">
              <SkipBack className="h-5 w-5" />
            </button>
            <button onClick={() => onSkip(10)} className="rounded-full p-1.5 text-white transition-transform hover:scale-110 pointer-coarse:hidden" aria-label="Avançar 10s">
              <SkipForward className="h-5 w-5" />
            </button>
          </>
        )}

        <div className="flex items-center gap-2 pointer-coarse:hidden">
          <button onClick={onToggleMute} className="rounded-full p-1.5 text-white transition-transform hover:scale-110" aria-label="Mudo">
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
            className="h-1 w-16 shrink-0 cursor-pointer appearance-none rounded-full bg-white/25 accent-brand-500 sm:w-20"
          />
        </div>

        {!isLive && (
          <span className="text-xs tabular-nums text-zinc-300">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {hasNext && !isLive && (
            <button
              onClick={onPlayNext}
              aria-label="Próximo episódio"
              title="Próximo episódio"
              className="rounded-full p-2 text-white transition-transform hover:scale-110 active:bg-white/20 pointer-coarse:hidden"
            >
              <SkipNext className="h-5 w-5" />
            </button>
          )}
          {fsSupported && (
            <button onClick={onToggleFullscreen} className="rounded-full p-2 text-white transition-transform hover:scale-110 active:bg-white/20" aria-label="Tela cheia">
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
