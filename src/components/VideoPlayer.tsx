import type Hls from 'hls.js'
import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Pause, Play, SkipBack, SkipForward, SkipNext, VolumeMute } from './icons'
import { useAirPlay } from '../hooks/useAirPlay'
import { castMedia, ensureCastSdk } from '../lib/cast'
import { usePlayerPrefs } from '../store/playerPrefs'
import { VideoPlayerBottomControls } from './VideoPlayerBottomControls'
import { VideoPlayerHeader } from './VideoPlayerHeader'
import type { QualityLevel } from './VideoPlayerQualityMenu'
import {
  CUE_BG_BY_SUBTITLE_BACKGROUND,
  CUE_SIZE_EM_BY_SUBTITLE_SIZE,
  NEXT_UP_LEAD,
  estimateInitialBandwidthBps,
} from './videoPlayerUtils'

interface NextEpisode {
  label: string
  onPlay: () => void
}

interface VideoPlayerProps {
  src: string
  isHls?: boolean
  isLive?: boolean
  autoPlay?: boolean
  startAt?: number
  title?: string
  subtitle?: string
  poster?: string | null
  onBack?: () => void
  onProgress?: (currentTime: number, duration: number) => void
  onEnded?: () => void
  /** Series only: renders a "next episode" button plus an auto-advance prompt in the closing seconds. */
  next?: NextEpisode | null
  /** Live only: zapping to the previous/next channel — arrow keys, on-screen buttons, and a vertical swipe on touch. */
  onChannelUp?: () => void
  onChannelDown?: () => void
}

interface AudioTrack {
  id: number
  name: string
}

interface SubtitleTrack {
  id: number
  name: string
}

export default function VideoPlayer({
  src,
  isHls = true,
  isLive = false,
  autoPlay = true,
  startAt = 0,
  title,
  subtitle,
  poster,
  onBack,
  onProgress,
  onEnded,
  next,
  onChannelUp,
  onChannelDown,
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
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
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
  // Live only: trades buffer cushion for latency. Off by default (see the hls.js config below for why:
  // this provider is known to be flaky, and a tight buffer stalls on it) — a per-session choice, not a
  // saved preference, since it's a "try it on this channel right now" toggle, not a standing setting.
  const [fastLive, setFastLive] = useState(false)
  // Whether this playback actually went through hls.js (vs. Safari's native HLS/plain <video src>) —
  // "Rápido" tunes hls.js's own buffer config, so it's hidden when there's no hls.js instance to tune.
  const [usingHlsJs, setUsingHlsJs] = useState(false)
  const [levels, setLevels] = useState<QualityLevel[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1)
  const [autoPickedHeight, setAutoPickedHeight] = useState<number | null>(null)
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([])
  const [currentAudioTrack, setCurrentAudioTrack] = useState(-1)
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([])
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState(-1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [openMenu, setOpenMenu] = useState<'quality' | 'audio' | 'subtitles' | 'speed' | null>(null)
  const [pipSupported, setPipSupported] = useState(false)
  const [isPip, setIsPip] = useState(false)
  const [nextUpVisible, setNextUpVisible] = useState(false)
  const [nextUpDismissed, setNextUpDismissed] = useState(false)
  const { supported: airPlaySupported, showPicker: showAirPlayPicker } = useAirPlay(videoRef)
  const [castSupported, setCastSupported] = useState(false)
  const [casting, setCasting] = useState(false)
  // iPhone Safari has no element-level Fullscreen API — only <video>'s own native player supports it,
  // which replaces our whole UI (controls, subtitle/audio menus, the live "Rápido" toggle, etc.) with
  // Apple's. The watch page is already a fixed full-viewport overlay, so there's nothing left to gain by
  // reaching for that; the button just doesn't render there instead of trading our UI away for Apple's.
  const [fsSupported] = useState(() => typeof document !== 'undefined' && Boolean(document.documentElement.requestFullscreen))

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
  const subtitleSize = usePlayerPrefs((s) => s.subtitleSize)
  const subtitleBackground = usePlayerPrefs((s) => s.subtitleBackground)
  const setSubtitleSize = usePlayerPrefs((s) => s.setSubtitleSize)
  const setSubtitleBackground = usePlayerPrefs((s) => s.setSubtitleBackground)
  // Scopes the ::cue rule below to this player instance — a plain className won't do, ::cue only
  // accepts a simple selector chain (no descendant combinators into it) so it has to be `#id video::cue`.
  const playerId = useId().replace(/:/g, '')
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
    setUsingHlsJs(false)
    setAutoPickedHeight(null)
    setAudioTracks([])
    setCurrentAudioTrack(-1)
    setSubtitleTracks([])
    setCurrentSubtitleTrack(-1)
    setNeedsUnmutePrompt(false)
    setDownloadedPct(null)
    setNextUpVisible(false)
    setNextUpDismissed(false)
    // Restore the volume level from last time instead of always starting at 100%.
    video.volume = savedVolume
    video.muted = savedMuted
    // Playback rate is a per-title choice (e.g. lectures vs. movies), not a saved preference, so each new title starts at 1x.
    video.playbackRate = 1
    setPlaybackRate(1)

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
    // A single failed attempt used to be final — if `video.play()` rejected for a reason other than
    // the well-known "needs a gesture" case (e.g. it raced the source not being fully ready yet), the
    // player was stuck showing the big play button forever even though nothing was actually blocking
    // playback. Retrying from every readiness event (loadedmetadata, canplay, and again once buffering
    // clears) catches that instead of committing to whichever event happened to fire first.
    function onCanPlay() {
      setBuffering(false)
      attemptAutoplay()
    }
    function onVideoError() {
      if (!isHls) setError('Não foi possível reproduzir este arquivo. Formato pode não ser suportado pelo navegador.')
    }
    async function attemptAutoplay() {
      if (!autoPlay || !video || !video.paused) return
      try {
        await video.play()
      } catch {
        // Browsers reject autoplay-with-sound without a prior user gesture.
        // Fall back to a muted autoplay (universally allowed) so playback
        // actually starts, and surface a one-tap "unmute" prompt instead of
        // leaving a black screen with no visible next step.
        if (!video || !video.paused) return
        video.muted = true
        try {
          await video.play()
          setNeedsUnmutePrompt(true)
        } catch {
          // Genuinely blocked (e.g. autoplay disabled site-wide) — the big play button is the fallback,
          // and the canplay/playing retries above will pick it back up the moment that stops being true.
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
      // Safari (iOS and macOS) plays HLS natively — video.src = the .m3u8 directly, same as any other
      // <video>, no MediaSource involved. This has to be checked and preferred *before* even asking
      // hls.js whether it thinks the browser is supported: hls.js's own isSupported() checks for
      // MediaSource Extensions, which Safari also has, so that check alone can never tell Safari apart
      // from everyone else — every browser that can run hls.js at all was taking this branch, including
      // Safari, despite a comment below (now moved) claiming otherwise. The real, user-visible cost: HLS
      // delivered through MediaSource can only AirPlay as audio on iOS, not mirror actual video — a
      // documented WebKit/hls.js interaction, confirmed against a real Apple TV. Native playback doesn't
      // have that limit. The trade-off (accepted): the audio-track/subtitle-track/manual-quality menus
      // below are populated from hls.js's own events, so they stay empty here — Safari's native player
      // doesn't hand those to JS the same way. Most IPTV sources only carry one audio track anyway.
      // Strictly 'probably', not just non-empty: canPlayType can also return the noncommittal 'maybe'
      // for a MIME type a browser doesn't actually support (confirmed against real Chromium, which
      // answered 'maybe' here despite having no native HLS playback at all) — 'probably' is what Safari
      // specifically answers for HLS, and the well-established way sites detect it.
      const nativeHlsSupported = video.canPlayType('application/vnd.apple.mpegurl') === 'probably'
      if (isHls && !nativeHlsSupported) {
        // hls.js (~250KB) is only needed for live channels; VOD plays as
        // plain mp4/webm, so keep it out of the main bundle.
        const { default: HlsCtor } = await import('hls.js')
        if (cancelled || !video) return

        if (HlsCtor.isSupported()) {
          setUsingHlsJs(true)
          hls = new HlsCtor({
            enableWorker: true,
            lowLatencyMode: false,
            // This provider's origin is measurably flaky (observed 502/504s
            // and multi-second latency spikes under load), so a very tight
            // live-edge buffer stalls constantly waiting on segments that
            // aren't ready yet. 3 segments (~18-21s) is close to hls.js's own
            // default and gives enough cushion to ride out a slow fragment
            // without rebuffering, while staying well short of the old
            // 4-segment/90s config's delay. `fastLive` trades that cushion
            // away on request (see the toggle in the controls bar) — less
            // delay, more risk of rebuffering on this same flaky origin.
            maxBufferLength: fastLive ? 8 : 20,
            maxMaxBufferLength: fastLive ? 16 : 40,
            liveSyncDurationCount: fastLive ? 2 : 3,
            liveMaxLatencyDurationCount: fastLive ? 4 : 8,
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
          hls.on(HlsCtor.Events.AUDIO_TRACKS_UPDATED, (_evt, data) => {
            if (cancelled) return
            setAudioTracks(
              data.audioTracks.map((t, i) => ({ id: i, name: t.name || t.lang || `Faixa ${i + 1}` })),
            )
            setCurrentAudioTrack(hls?.audioTrack ?? -1)
          })
          hls.on(HlsCtor.Events.AUDIO_TRACK_SWITCHED, (_evt, data) => {
            if (!cancelled) setCurrentAudioTrack(data.id)
          })
          hls.on(HlsCtor.Events.SUBTITLE_TRACKS_UPDATED, (_evt, data) => {
            if (cancelled) return
            setSubtitleTracks(
              data.subtitleTracks.map((t, i) => ({ id: i, name: t.name || t.lang || `Faixa ${i + 1}` })),
            )
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
          // hls.js itself says this browser can't do MSE-based HLS after all (rare) — last-resort
          // fallback to a plain <video src>, same as the native-HLS and VOD paths below.
          video.src = src
        }
      } else {
        // VOD, or a browser (Safari) with native HLS support — see the comment above `nativeHlsSupported`.
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
  }, [src, isHls, retryToken, fastLive])

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
        case 'ArrowUp':
          if (isLive && onChannelUp) {
            e.preventDefault()
            onChannelUp()
          }
          break
        case 'ArrowDown':
          if (isLive && onChannelDown) {
            e.preventDefault()
            onChannelDown()
          }
          break
        case 'm':
          video.muted = !video.muted
          break
        case 'f':
          toggleFullscreen()
          break
        case 'i':
          togglePip()
          break
        case ',':
        case '<':
          if (!isLive) setSpeed(Math.max(0.5, Math.round((video.playbackRate - 0.25) * 100) / 100))
          break
        case '.':
        case '>':
          if (!isLive) setSpeed(Math.min(2, Math.round((video.playbackRate + 0.25) * 100) / 100))
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, onChannelUp, onChannelDown])

  // --- Picture-in-Picture support + state tracking ---
  useEffect(() => {
    setPipSupported(document.pictureInPictureEnabled && !!videoRef.current?.requestPictureInPicture)
    const video = videoRef.current
    if (!video) return
    function onEnterPip() {
      setIsPip(true)
    }
    function onLeavePip() {
      setIsPip(false)
    }
    video.addEventListener('enterpictureinpicture', onEnterPip)
    video.addEventListener('leavepictureinpicture', onLeavePip)
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPip)
      video.removeEventListener('leavepictureinpicture', onLeavePip)
    }
  }, [])

  // --- Chromecast: loads the sender SDK lazily (Chromium browsers only — see lib/cast.ts) so a Safari/
  // Firefox viewer never pays for the extra script. Not testable against real hardware here (see the
  // caveat in lib/cast.ts); this only verifies the button appears and calls the SDK correctly.
  useEffect(() => {
    let cancelled = false
    ensureCastSdk().then((ok) => {
      if (!cancelled) setCastSupported(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleCast() {
    if (!casting) {
      setCasting(true)
      try {
        await castMedia({
          url: new URL(src, window.location.origin).toString(),
          contentType: isHls ? 'application/x-mpegurl' : 'video/mp4',
          title: title || 'PedreiraFlix',
          poster,
          startAtSeconds: videoRef.current?.currentTime,
        })
      } catch {
        // User cancelled the device picker, or no Cast session — nothing to recover, just stop "casting".
        setCasting(false)
      }
    } else {
      setCasting(false)
    }
  }

  // --- Wake Lock: keeps the screen on while actively playing (phones/tablets dim and lock otherwise). ---
  useEffect(() => {
    if (!isPlaying) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    navigator.wakeLock
      ?.request('screen')
      .then((sentinel) => {
        if (cancelled) {
          sentinel.release().catch(() => {})
          return
        }
        lock = sentinel
      })
      .catch(() => {
        // Unsupported browser, or the tab lost focus before the request resolved — playback still works either way.
      })
    return () => {
      cancelled = true
      lock?.release().catch(() => {})
    }
  }, [isPlaying])

  // --- Media Session: lock-screen / notification-shade transport controls and metadata. ---
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'PedreiraFlix',
      artist: subtitle || 'PedreiraFlix',
      artwork: poster ? [{ src: poster, sizes: '512x512', type: 'image/png' }] : [],
    })
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    navigator.mediaSession.setActionHandler('play', () => videoRef.current?.play().catch(() => {}))
    navigator.mediaSession.setActionHandler('pause', () => videoRef.current?.pause())
    if (isLive) {
      navigator.mediaSession.setActionHandler('seekbackward', null)
      navigator.mediaSession.setActionHandler('seekforward', null)
      navigator.mediaSession.setActionHandler('seekto', null)
    } else {
      navigator.mediaSession.setActionHandler('seekbackward', () => skip(-10))
      navigator.mediaSession.setActionHandler('seekforward', () => skip(10))
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (videoRef.current && details.seekTime != null) videoRef.current.currentTime = details.seekTime
      })
    }
    navigator.mediaSession.setActionHandler('nexttrack', next ? next.onPlay : null)
    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('seekbackward', null)
      navigator.mediaSession.setActionHandler('seekforward', null)
      navigator.mediaSession.setActionHandler('seekto', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, subtitle, poster, isPlaying, isLive, next])

  // --- Media Session: keep the lock-screen scrubber in sync with playback position. ---
  useEffect(() => {
    if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession) || isLive) return
    if (!Number.isFinite(duration) || duration <= 0) return
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(currentTime, duration),
        playbackRate,
      })
    } catch {
      // Fires if position/duration briefly disagree (e.g. right after a seek); harmless to skip a frame.
    }
  }, [currentTime, duration, playbackRate, isLive])

  // --- Next episode: auto-advance prompt in the closing seconds of a VOD title. ---
  useEffect(() => {
    if (!next || isLive || nextUpDismissed || !duration) {
      setNextUpVisible(false)
      return
    }
    setNextUpVisible(duration - currentTime <= NEXT_UP_LEAD)
  }, [currentTime, duration, next, isLive, nextUpDismissed])

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
    if (!container || !container.requestFullscreen) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      container
        .requestFullscreen()
        // Phones: rotate to landscape like the YouTube/Netflix apps (Android Chrome only, best effort).
        .then(() => {
          if (window.matchMedia('(pointer: coarse)').matches) return orientation()?.lock?.('landscape')
        })
        .catch(() => {})
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
    setOpenMenu(null)
  }

  function selectAudioTrack(id: number) {
    if (hlsRef.current) hlsRef.current.audioTrack = id
    setCurrentAudioTrack(id)
    setOpenMenu(null)
  }

  function selectSubtitleTrack(id: number) {
    if (hlsRef.current) hlsRef.current.subtitleTrack = id
    setCurrentSubtitleTrack(id)
    setOpenMenu(null)
  }

  function setSpeed(rate: number) {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = rate
    setPlaybackRate(rate)
    setOpenMenu(null)
  }

  function togglePip() {
    const video = videoRef.current
    if (!video || !pipSupported) return
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {})
    } else {
      video.requestPictureInPicture().catch(() => {})
    }
  }

  function playNext() {
    setNextUpVisible(false)
    next?.onPlay()
  }

  const CUE_SIZE_EM = CUE_SIZE_EM_BY_SUBTITLE_SIZE[subtitleSize]
  const CUE_BG = CUE_BG_BY_SUBTITLE_BACKGROUND[subtitleBackground]

  return (
    <div
      ref={containerRef}
      id={playerId}
      className={`group/player relative h-full w-full touch-manipulation select-none bg-black ${controlsVisible ? '' : 'cursor-none'}`}
      // Runs before the emulated mouse events, so the handlers below know what kind of pointer this is.
      onPointerDown={(e) => {
        lastPointerType.current = e.pointerType
        if (isLive && e.pointerType === 'touch') swipeStart.current = { y: e.clientY, x: e.clientX }
      }}
      onPointerUp={(e) => {
        // Vertical swipe zaps channels (live only — horizontal edges are already the seek zone on VOD, and
        // live has no seek to conflict with here). A near-vertical drag past the threshold wins over a tap.
        if (!isLive || e.pointerType !== 'touch' || !swipeStart.current) return
        const { x, y } = swipeStart.current
        swipeStart.current = null
        const dy = y - e.clientY
        const dx = Math.abs(e.clientX - x)
        if (Math.abs(dy) > 60 && Math.abs(dy) > dx * 1.5) {
          if (dy > 0) onChannelUp?.()
          else onChannelDown?.()
        }
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
      {/* Styles the browser's native WebVTT rendering (hls.js attaches real <track> elements by default) —
          ::cue only accepts a bare selector, so this scopes to just this player via its own id. */}
      <style>{`#${playerId} video::cue { font-size: ${CUE_SIZE_EM}em; background: ${CUE_BG}; }`}</style>
      <video ref={videoRef} className="h-full w-full" playsInline poster={poster ?? undefined} />

      <VideoPlayerHeader
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        controlsVisible={controlsVisible}
        openMenu={openMenu}
        onToggleMenu={(menu) => setOpenMenu((m) => (m === menu ? null : menu))}
        audioTracks={audioTracks}
        currentAudioTrack={currentAudioTrack}
        onSelectAudioTrack={selectAudioTrack}
        subtitleTracks={subtitleTracks}
        currentSubtitleTrack={currentSubtitleTrack}
        subtitleSize={subtitleSize}
        subtitleBackground={subtitleBackground}
        onSelectSubtitleTrack={selectSubtitleTrack}
        onSelectSubtitleSize={setSubtitleSize}
        onSelectSubtitleBackground={setSubtitleBackground}
        isLive={isLive}
        playbackRate={playbackRate}
        onSelectSpeed={setSpeed}
        pipSupported={pipSupported}
        isPip={isPip}
        onTogglePip={togglePip}
        airPlaySupported={airPlaySupported}
        onShowAirPlayPicker={showAirPlayPicker}
        castSupported={castSupported}
        casting={casting}
        onCast={handleCast}
        levels={levels}
        currentLevel={currentLevel}
        autoPickedHeight={autoPickedHeight}
        onSelectLevel={selectLevel}
      />

      {nextUpVisible && next && !error && (
        <div data-controls className="absolute bottom-24 right-3 z-20 sm:bottom-28 sm:right-6">
          <div className="glass-panel glow-border flex w-64 flex-col gap-2 rounded-xl p-3">
            <p className="text-xs text-zinc-400">A seguir</p>
            <p className="truncate text-sm font-semibold text-white">{next.label}</p>
            <div className="flex gap-2">
              <button
                onClick={playNext}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-700 py-2 text-xs font-bold text-white hover:brightness-110"
              >
                <SkipNext className="h-4 w-4" /> Reproduzir
              </button>
              <button
                onClick={() => {
                  setNextUpVisible(false)
                  setNextUpDismissed(true)
                }}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10"
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

      {isLive && (onChannelUp || onChannelDown) && !error && (
        <div
          data-controls
          className={`absolute right-2 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 transition-opacity duration-200 sm:right-4 ${
            controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <button
            onClick={onChannelUp}
            disabled={!onChannelUp}
            aria-label="Próximo canal"
            title="Próximo canal (↑)"
            className="rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm transition-transform hover:scale-110 active:bg-black/70 disabled:opacity-30"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          <button
            onClick={onChannelDown}
            disabled={!onChannelDown}
            aria-label="Canal anterior"
            title="Canal anterior (↓)"
            className="rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm transition-transform hover:scale-110 active:bg-black/70 disabled:opacity-30"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      )}

      {buffering && !error && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-brand-400" />
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
        <VideoPlayerBottomControls
          controlsVisible={controlsVisible}
          isLive={isLive}
          usingHlsJs={usingHlsJs}
          fastLive={fastLive}
          onToggleFastLive={() => setFastLive((v) => !v)}
          duration={duration}
          currentTime={currentTime}
          onSeek={handleSeek}
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          onSkip={skip}
          isMuted={isMuted}
          volume={volume}
          onToggleMute={toggleMute}
          onVolumeChange={handleVolume}
          hasNext={Boolean(next)}
          onPlayNext={playNext}
          fsSupported={fsSupported}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
    </div>
  )
}
