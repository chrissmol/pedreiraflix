import type Hls from 'hls.js'
import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  Maximize,
  Minimize,
  Pause,
  Play,
  Settings,
  SkipBack,
  SkipForward,
  VolumeHigh,
  VolumeMute,
} from './icons'
import { usePlayerPrefs } from '../store/playerPrefs'

interface VideoPlayerProps {
  src: string
  isHls?: boolean
  isLive?: boolean
  autoPlay?: boolean
  startAt?: number
  title?: string
  subtitle?: string
  onBack?: () => void
  onProgress?: (currentTime: number, duration: number) => void
  onEnded?: () => void
}

interface QualityLevel {
  index: number
  height: number
  bitrate: number
}

// Chrome/Edge expose a rough downlink estimate (Mbps) via the Network
// Information API. When present, seed hls.js's bandwidth estimator with it
// so a connection that's already fast starts at a high quality level
// immediately instead of ramping up from a conservative default guess.
function estimateInitialBandwidthBps(): number | undefined {
  const nav = navigator as Navigator & { connection?: { downlink?: number } }
  const downlinkMbps = nav.connection?.downlink
  if (!downlinkMbps || downlinkMbps <= 0) return undefined
  return Math.round(downlinkMbps * 1_000_000 * 0.8)
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export default function VideoPlayer({
  src,
  isHls = true,
  isLive = false,
  autoPlay = true,
  startAt = 0,
  title,
  subtitle,
  onBack,
  onProgress,
  onEnded,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const volumeSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Touch vs mouse decides what a tap means (YouTube: tap toggles controls, double-tap on the edges seeks).
  const lastPointerType = useRef('mouse')
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTap = useRef({ time: 0, side: 0 })
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [seekFlash, setSeekFlash] = useState<{ side: -1 | 1; key: number } | null>(null)

  const [error, setError] = useState<string | null>(null)
  // Starts true (not false): a slow origin can take several seconds just to
  // deliver enough of the file for the browser to read its metadata, and
  // during that window there's otherwise no feedback at all — just a black
  // screen that looks frozen. The existing 'canplay'/'playing' handlers below
  // clear it as soon as there's real progress.
  const [buffering, setBuffering] = useState(true)
  const [retryToken, setRetryToken] = useState(0)
  const [levels, setLevels] = useState<QualityLevel[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1)
  const [autoPickedHeight, setAutoPickedHeight] = useState<number | null>(null)
  const [showQualityMenu, setShowQualityMenu] = useState(false)

  // Starts false regardless of the `autoPlay` intent: browsers can silently
  // reject an unmuted autoplay attempt, and if this stayed optimistically
  // true the big play button would stay hidden with nothing on screen to
  // click — the "black screen until I click randomly" bug. The 'play'/
  // 'pause' events below are the only source of truth for this.
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const savedVolume = usePlayerPrefs((s) => s.volume)
  const savedMuted = usePlayerPrefs((s) => s.muted)
  const setVolumePrefs = usePlayerPrefs((s) => s.setVolumePrefs)
  const [volume, setVolume] = useState(savedVolume)
  const [isMuted, setIsMuted] = useState(savedMuted)
  const [needsUnmutePrompt, setNeedsUnmutePrompt] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [showSlowHint, setShowSlowHint] = useState(false)
  const [downloadedPct, setDownloadedPct] = useState<number | null>(null)

  // If buffering drags on past a few seconds, say so explicitly — a slow
  // origin server can take a while just to deliver enough data to start,
  // and an unexplained spinner reads as "frozen" rather than "still working".
  useEffect(() => {
    if (!buffering) {
      setShowSlowHint(false)
      return
    }
    const t = setTimeout(() => setShowSlowHint(true), 4000)
    return () => clearTimeout(t)
  }, [buffering])

  // --- Source setup: hls.js for live m3u8, plain <video src> otherwise ---
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    setError(null)
    setBuffering(true)
    setLevels([])
    setCurrentLevel(-1)
    setAutoPickedHeight(null)
    setNeedsUnmutePrompt(false)
    setDownloadedPct(null)
    // Restore the volume level from last time instead of always starting at 100%.
    video.volume = savedVolume
    video.muted = savedMuted

    let hls: Hls | null = null
    let cancelled = false
    let networkRetries = 0
    const MAX_NETWORK_RETRIES = 4

    function onWaiting() {
      setBuffering(true)
    }
    function onPlaying() {
      setBuffering(false)
      networkRetries = 0
    }
    function onCanPlay() {
      setBuffering(false)
    }
    function onVideoError() {
      if (!isHls) setError('Não foi possível reproduzir este arquivo. Formato pode não ser suportado pelo navegador.')
    }
    async function attemptAutoplay() {
      if (!autoPlay || !video) return
      try {
        await video.play()
      } catch {
        // Browsers reject autoplay-with-sound without a prior user gesture.
        // Fall back to a muted autoplay (universally allowed) so playback
        // actually starts, and surface a one-tap "unmute" prompt instead of
        // leaving a black screen with no visible next step.
        if (!video) return
        video.muted = true
        try {
          await video.play()
          setNeedsUnmutePrompt(true)
        } catch {
          // Autoplay is fully blocked; the big play button (isPlaying=false) is the fallback.
        }
      }
    }
    function onLoadedMetadata() {
      if (!video) return
      if (startAt > 0 && startAt < video.duration) video.currentTime = startAt
      setDuration(Number.isFinite(video.duration) ? video.duration : 0)
      attemptAutoplay()
    }
    function onTimeUpdate() {
      if (!video) return
      setCurrentTime(video.currentTime)
      onProgress?.(video.currentTime, video.duration || 0)
    }
    function onDurationChange() {
      if (video) setDuration(Number.isFinite(video.duration) ? video.duration : 0)
    }
    function onDownloadProgress() {
      // How much of the file the browser has actually buffered ahead, as a
      // percentage of total duration — the same signal players use to draw
      // the light-gray "buffered" bar. Only meaningful once duration is known
      // and finite (live streams report Infinity and have no fixed end).
      if (!video || isLive || !Number.isFinite(video.duration) || video.duration <= 0) return
      if (video.buffered.length === 0) return
      const bufferedEnd = video.buffered.end(video.buffered.length - 1)
      setDownloadedPct(Math.min(100, Math.round((bufferedEnd / video.duration) * 100)))
    }
    function onPlay() {
      setIsPlaying(true)
    }
    function onPause() {
      setIsPlaying(false)
    }
    function onVolumeChange() {
      if (!video) return
      setVolume(video.volume)
      setIsMuted(video.muted)
      if (!video.muted) setNeedsUnmutePrompt(false)
      // Debounced so dragging the slider doesn't write to localStorage on every tick.
      if (volumeSaveTimeout.current) clearTimeout(volumeSaveTimeout.current)
      volumeSaveTimeout.current = setTimeout(() => {
        if (video) setVolumePrefs(video.volume, video.muted)
      }, 300)
    }

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('progress', onDownloadProgress)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('error', onVideoError)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('volumechange', onVolumeChange)
    if (onEnded) video.addEventListener('ended', onEnded)

    async function setup() {
      if (!video) return
      if (isHls) {
        // hls.js (~250KB) is only needed for live channels; VOD plays as
        // plain mp4/webm, so keep it out of the main bundle.
        const { default: HlsCtor } = await import('hls.js')
        if (cancelled || !video) return

        if (HlsCtor.isSupported()) {
          hls = new HlsCtor({
            enableWorker: true,
            lowLatencyMode: false,
            // This provider's origin is measurably flaky (observed 502/504s
            // and multi-second latency spikes under load), so a very tight
            // live-edge buffer stalls constantly waiting on segments that
            // aren't ready yet. 3 segments (~18-21s) is close to hls.js's own
            // default and gives enough cushion to ride out a slow fragment
            // without rebuffering, while staying well short of the old
            // 4-segment/90s config's delay.
            maxBufferLength: 20,
            maxMaxBufferLength: 40,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 8,
            manifestLoadingMaxRetry: 6,
            manifestLoadingRetryDelay: 1000,
            levelLoadingMaxRetry: 6,
            fragLoadingMaxRetry: 6,
            fragLoadingRetryDelay: 1000,
            // Auto quality selection (startLevel -1). If the browser can tell
            // us the connection is already fast, seed the estimator with that
            // instead of hls.js's conservative default guess (~500kbps), so a
            // good connection jumps straight to a high level like a real
            // streaming service instead of ramping up from the bottom.
            startLevel: -1,
            capLevelToPlayerSize: true,
            abrEwmaDefaultEstimate: estimateInitialBandwidthBps() ?? 500_000,
          })
          hlsRef.current = hls
          hls.loadSource(src)
          hls.attachMedia(video)

          hls.on(HlsCtor.Events.MANIFEST_PARSED, (_evt, data) => {
            if (cancelled) return
            if (data.levels.length > 1) {
              setLevels(
                data.levels.map((lvl, index) => ({ index, height: lvl.height, bitrate: lvl.bitrate })),
              )
            }
          })
          hls.on(HlsCtor.Events.LEVEL_SWITCHED, (_evt, data) => {
            if (cancelled) return
            const level = hls?.levels[data.level]
            if (level) setAutoPickedHeight(level.height)
          })

          hls.on(HlsCtor.Events.ERROR, (_evt, data) => {
            if (!data.fatal) return
            switch (data.type) {
              case HlsCtor.ErrorTypes.NETWORK_ERROR:
                networkRetries += 1
                if (networkRetries <= MAX_NETWORK_RETRIES) {
                  setBuffering(true)
                  hls?.startLoad()
                } else {
                  setError('Sinal instável: não foi possível reconectar ao stream.')
                }
                break
              case HlsCtor.ErrorTypes.MEDIA_ERROR:
                hls?.recoverMediaError()
                break
              default:
                setError('Erro ao carregar o stream. Verifique a conexão ou o canal.')
                hls?.destroy()
            }
          })
        } else {
          // Safari/iOS play HLS natively; no hls.js needed.
          video.src = src
        }
      } else {
        video.src = src
      }
    }

    setup()

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('progress', onDownloadProgress)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('error', onVideoError)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('volumechange', onVolumeChange)
      if (onEnded) video.removeEventListener('ended', onEnded)
      if (volumeSaveTimeout.current) clearTimeout(volumeSaveTimeout.current)
      hlsRef.current = null
      hls?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, isHls, retryToken])

  // --- Fullscreen tracking ---
  useEffect(() => {
    function onFsChange() {
      const fs = document.fullscreenElement === containerRef.current
      setIsFullscreen(fs)
      if (!fs) orientation()?.unlock?.()
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // --- Auto-hide controls after inactivity while playing ---
  function wakeControls() {
    setControlsVisible(true)
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current)
    hideControlsTimeout.current = setTimeout(() => {
      if (isPlaying) setControlsVisible(false)
    }, 3000)
  }
  useEffect(() => {
    if (!isPlaying) setControlsVisible(true)
    else wakeControls()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying])

  // --- Keyboard shortcuts ---
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const video = videoRef.current
      if (!video) return
      if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
        return
      }
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          if (!isLive) video.currentTime = Math.max(0, video.currentTime - 10)
          wakeControls()
          break
        case 'ArrowRight':
          if (!isLive) video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10)
          wakeControls()
          break
        case 'm':
          video.muted = !video.muted
          break
        case 'f':
          toggleFullscreen()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive])

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }

  function skip(seconds: number) {
    const video = videoRef.current
    if (!video || isLive) return
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds))
    wakeControls()
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Number(e.target.value)
    setCurrentTime(Number(e.target.value))
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current
    if (!video) return
    const v = Number(e.target.value)
    video.volume = v
    video.muted = v === 0
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
  }

  function unmute() {
    const video = videoRef.current
    if (!video) return
    video.muted = false
    if (video.volume === 0) video.volume = 1
  }

  function toggleFullscreen() {
    const container = containerRef.current
    if (!container) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else if (container.requestFullscreen) {
      container
        .requestFullscreen()
        // Phones: rotate to landscape like the YouTube/Netflix apps (Android Chrome only, best effort).
        .then(() => {
          if (window.matchMedia('(pointer: coarse)').matches) return orientation()?.lock?.('landscape')
        })
        .catch(() => {})
    } else {
      // iPhone Safari can only fullscreen the <video> itself (native player takes over).
      ;(videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null)?.webkitEnterFullscreen?.()
    }
  }

  function onContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('[data-controls]')) return
    if (lastPointerType.current !== 'touch') {
      togglePlay()
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const side = x < rect.width / 3 ? -1 : x > (rect.width * 2) / 3 ? 1 : 0
    const now = Date.now()
    const isRepeat = now - lastTap.current.time < 300 && lastTap.current.side === side
    lastTap.current = { time: now, side }
    if (tapTimer.current) clearTimeout(tapTimer.current)
    if (isRepeat) {
      // Keeping `time` fresh means a third/fourth tap keeps seeking, as on YouTube.
      if (side !== 0 && !isLive) {
        skip(side * 10)
        setSeekFlash({ side, key: now })
        if (flashTimer.current) clearTimeout(flashTimer.current)
        flashTimer.current = setTimeout(() => setSeekFlash(null), 600)
      }
      return
    }
    // Wait out the double-tap window before treating it as a single tap.
    tapTimer.current = setTimeout(() => {
      if (controlsVisible && isPlaying) setControlsVisible(false)
      else wakeControls()
    }, 250)
  }

  function orientation() {
    return screen.orientation as unknown as { lock?: (o: string) => Promise<void>; unlock?: () => void } | undefined
  }

  function selectLevel(index: number) {
    if (hlsRef.current) hlsRef.current.currentLevel = index
    setCurrentLevel(index)
    setShowQualityMenu(false)
  }

  return (
    <div
      ref={containerRef}
      className={`group/player relative h-full w-full touch-manipulation select-none bg-black ${controlsVisible ? '' : 'cursor-none'}`}
      // Runs before the emulated mouse events, so the handlers below know what kind of pointer this is.
      onPointerDown={(e) => {
        lastPointerType.current = e.pointerType
      }}
      // Touch fires an emulated mousemove right before click; ignoring it keeps a tap from re-showing the controls it is about to hide.
      onMouseMove={() => lastPointerType.current !== 'touch' && wakeControls()}
      onClick={onContainerClick}
      // Mouse, YouTube-style: the two clicks of a double-click cancel out (pause+play), net effect is fullscreen only.
      onDoubleClick={(e) => {
        if (lastPointerType.current === 'touch' || (e.target as HTMLElement).closest('[data-controls]')) return
        toggleFullscreen()
      }}
    >
      <video ref={videoRef} className="h-full w-full" playsInline />

      <div
        data-controls
        className={`absolute inset-x-0 top-0 z-20 flex items-start gap-2 bg-gradient-to-b from-black/80 to-transparent pb-8 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] transition-opacity duration-200 ${
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Voltar"
            className="shrink-0 rounded-full p-2 text-white transition-colors hover:bg-white/10 active:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <div className="min-w-0 flex-1 pt-1.5">
          {title && <h1 className="font-display truncate text-sm font-semibold text-white sm:text-base">{title}</h1>}
          {subtitle && <p className="truncate text-xs text-zinc-300">{subtitle}</p>}
        </div>
        {levels.length > 1 && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowQualityMenu((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:border-brand-400/40"
            >
              <Settings className="h-4 w-4" />
              {currentLevel === -1 ? `Auto${autoPickedHeight ? ` (${autoPickedHeight}p)` : ''}` : `${levels.find((l) => l.index === currentLevel)?.height}p`}
            </button>
            {showQualityMenu && (
              <div className="glass-panel absolute right-0 mt-1.5 w-36 overflow-hidden rounded-lg text-sm">
                <button
                  onClick={() => selectLevel(-1)}
                  className={`block w-full px-3 py-3 text-left transition-colors hover:bg-white/10 active:bg-white/10 ${
                    currentLevel === -1 ? 'text-brand-300' : 'text-white'
                  }`}
                >
                  Automático
                </button>
                {[...levels]
                  .sort((a, b) => b.height - a.height)
                  .map((lvl) => (
                    <button
                      key={lvl.index}
                      onClick={() => selectLevel(lvl.index)}
                      className={`block w-full px-3 py-3 text-left transition-colors hover:bg-white/10 active:bg-white/10 ${
                        currentLevel === lvl.index ? 'text-brand-300' : 'text-white'
                      }`}
                    >
                      {lvl.height}p
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

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
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-brand-400 shadow-[0_0_20px_rgba(15,123,255,0.4)]" />
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
          onClick={unmute}
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
              onClick={() => skip(-10)}
              aria-label="Voltar 10s"
              className={`rounded-full bg-black/40 p-3 text-white backdrop-blur-sm active:bg-black/60 ${controlsVisible ? 'pointer-events-auto' : ''}`}
            >
              <SkipBack className="h-6 w-6" />
            </button>
          )}
          <button
            data-controls
            onClick={togglePlay}
            aria-label="Play/Pause"
            className={`rounded-full bg-black/40 p-5 text-white backdrop-blur-sm active:bg-black/60 ${controlsVisible ? 'pointer-events-auto' : ''}`}
          >
            {isPlaying ? <Pause className="h-9 w-9" /> : <Play className="ml-0.5 h-9 w-9" />}
          </button>
          {!isLive && (
            <button
              data-controls
              onClick={() => skip(10)}
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
            onClick={() => {
              setError(null)
              setRetryToken((t) => t + 1)
            }}
            className="glow-border rounded-lg bg-gradient-to-r from-brand-500 to-brand-700 px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!error && (
        <div
          data-controls
          className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-8 transition-opacity duration-200 ${
            controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          {isLive ? (
            <div className="mb-2 flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand-400 shadow-[0_0_8px_rgba(15,123,255,0.9)]" />
              <span className="text-xs font-bold tracking-wide text-white">AO VIVO</span>
            </div>
          ) : (
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              aria-label="Progresso"
              className="mb-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-brand-500 pointer-coarse:h-2"
            />
          )}

          {/* Touch hides the buttons the center cluster already has, and the volume (phones use the hardware keys). */}
          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="rounded-full p-1.5 text-white transition-transform hover:scale-110 pointer-coarse:hidden" aria-label="Play/Pause">
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            </button>

            {!isLive && (
              <>
                <button onClick={() => skip(-10)} className="rounded-full p-1.5 text-white transition-transform hover:scale-110 pointer-coarse:hidden" aria-label="Voltar 10s">
                  <SkipBack className="h-5 w-5" />
                </button>
                <button onClick={() => skip(10)} className="rounded-full p-1.5 text-white transition-transform hover:scale-110 pointer-coarse:hidden" aria-label="Avançar 10s">
                  <SkipForward className="h-5 w-5" />
                </button>
              </>
            )}

            <div className="flex items-center gap-2 pointer-coarse:hidden">
              <button onClick={toggleMute} className="rounded-full p-1.5 text-white transition-transform hover:scale-110" aria-label="Mudo">
                {isMuted || volume === 0 ? <VolumeMute className="h-5 w-5" /> : <VolumeHigh className="h-5 w-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolume}
                aria-label="Volume"
                className="h-1 w-16 shrink-0 cursor-pointer appearance-none rounded-full bg-white/25 accent-brand-500 sm:w-20"
              />
            </div>

            {!isLive && (
              <span className="text-xs tabular-nums text-zinc-300">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            )}

            <div className="ml-auto flex items-center">
              <button onClick={toggleFullscreen} className="rounded-full p-2 text-white transition-transform hover:scale-110 active:bg-white/20" aria-label="Tela cheia">
                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
