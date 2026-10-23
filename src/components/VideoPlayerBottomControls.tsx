import { Maximize, Minimize, Pause, Play, SkipNext, SkipPrevious, SkipSeconds, VolumeHigh, VolumeMute, Zap } from './icons'
import { useState } from 'react'
import { SKIP_SECONDS, formatTime } from './videoPlayerUtils'

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
  hasPrevious: boolean
  onPlayPrevious: () => void
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
  hasPrevious,
  onPlayPrevious,
  hasNext,
  onPlayNext,
  fsSupported,
  isFullscreen,
  onToggleFullscreen,
}: VideoPlayerBottomControlsProps) {
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [keyFocus, setKeyFocus] = useState(false)
  const preview = hoverTime ?? (dragging || keyFocus ? currentTime : null)
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
          {/* No hls.js encurta o buffer; no HLS nativo do Safari so da para segurar no ponto ao vivo. */}
          <button
            onClick={onToggleFastLive}
            aria-pressed={fastLive}
            title={usingHlsJs ? 'Menos delay, mais risco de travar em picos do provedor' : 'Volta para o ponto ao vivo quando o vídeo atrasar'}
            className={`chip flex items-center gap-1 py-1 ${fastLive ? 'bg-brand-500/25 text-brand-300' : ''}`}
          >
            <Zap className="h-3 w-3" /> Rápido
          </button>
        </div>
      ) : (
        <div className="relative mb-2">
          {preview !== null && duration > 0 && (
            <span
              data-testid="previa-tempo"
              className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-md bg-black/85 px-2 py-1 text-body-sm font-semibold tabular-nums text-white shadow-lg"
              style={{ left: `clamp(2rem, ${(preview / duration) * 100}%, calc(100% - 2rem))` }}
            >
              {formatTime(preview)}
            </span>
          )}
          {/* Previa do tempo, como no YouTube: o mouse mostra onde ele esta; o dedo (arrastando) e o foco do teclado/TV
              mostram para onde a barra vai. Imagem nao: precisaria de uma segunda conexao com o provedor. */}
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={onSeek}
            onPointerMove={(e) => {
              if (e.pointerType !== 'mouse') return
              const r = e.currentTarget.getBoundingClientRect()
              setHoverTime(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * duration)
            }}
            onPointerLeave={() => setHoverTime(null)}
            onTouchStart={() => setDragging(true)}
            onTouchEnd={() => setDragging(false)}
            onTouchCancel={() => setDragging(false)}
            onFocus={(e) => setKeyFocus(e.currentTarget.matches(':focus-visible'))}
            onBlur={() => setKeyFocus(false)}
            aria-label="Progresso"
            style={{ '--pct': `${duration ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties}
            className="player-range w-full"
          />
        </div>
      )}

      {/* Touch hides the buttons the center cluster already has, and the volume (phones use the hardware keys). */}
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={onTogglePlay}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-fill text-white shadow-[0_12px_28px_-6px_rgba(15,123,255,0.5)] transition-transform hover:scale-105 active:scale-95 pointer-coarse:hidden"
          aria-label="Play/Pause"
        >
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
        </button>

        {!isLive && (
          <>
            <button onClick={() => onSkip(-SKIP_SECONDS)} className="player-btn bg-transparent pointer-coarse:hidden" aria-label="Voltar 10s">
              <SkipSeconds direction="back" seconds={SKIP_SECONDS} className="h-8 w-8" />
            </button>
            <button onClick={() => onSkip(SKIP_SECONDS)} className="player-btn bg-transparent pointer-coarse:hidden" aria-label="Avançar 10s">
              <SkipSeconds direction="forward" seconds={SKIP_SECONDS} className="h-8 w-8" />
            </button>
          </>
        )}

        <div className="hidden items-center gap-2 sm:flex pointer-coarse:hidden">
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
            className="player-range w-24 shrink-0"
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
          {/* Episodio anterior e proximo aparecem tambem no toque: no celular nao ha outro jeito de voltar
              para o episodio que acabou de ver (o proximo so surgia no cartao do fim do episodio). */}
          {hasPrevious && !isLive && (
            <button onClick={onPlayPrevious} aria-label="Episódio anterior" title="Episódio anterior" className="player-btn bg-transparent">
              <SkipPrevious className="h-5 w-5" />
            </button>
          )}
          {hasNext && !isLive && (
            <button onClick={onPlayNext} aria-label="Próximo episódio" title="Próximo episódio" className="player-btn bg-transparent">
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
