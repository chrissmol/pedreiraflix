import type Hls from 'hls.js'
import { useEffect, useId, useRef, useState } from 'react'
import { useAirPlay } from '../hooks/useAirPlay'
import { castMedia, ensureCastSdk } from '../lib/cast'
import { isTv } from '../lib/device'
import { usePlayerPrefs } from '../store/playerPrefs'
import { useActiveProfileId } from '../store/profiles'
import { VideoPlayerBottomControls } from './VideoPlayerBottomControls'
import { VideoPlayerCenterOverlays } from './VideoPlayerCenterOverlays'
import { VideoPlayerHeader } from './VideoPlayerHeader'
import type { QualityLevel } from './VideoPlayerQualityMenu'
import { useNativeHls } from './useNativeHls'
import { useVideoPlayerKeys } from './useVideoPlayerKeys'
import { useVideoSource } from './useVideoSource'
import { nativeSubtitleTracks, trackKey, type AudioTrack, type NativeAudioTrackList, type SubtitleTrack } from './videoPlayerTracks'
import { VideoPlayerZappingControls } from './VideoPlayerZappingControls'
import { useMediaSession, useSleepTimer, useStereoDownmix, useSubtitleOffset, useWakeLock } from './useVideoPlayerEffects'
import {
  NEXT_UP_LEAD,
  SKIP_SECONDS,
  supportsNativeHls,
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
  /** Series only: botao "episodio anterior" (voltar para rever o que acabou de ver). */
  previous?: NextEpisode | null
  /** Series only: abre o painel "Episodios" (lista da temporada) por cima do video. */
  onShowEpisodes?: () => void
  /** Live only: zapping to the previous/next channel — arrow keys, on-screen buttons, and a vertical swipe on touch. */
  onChannelUp?: () => void
  onChannelDown?: () => void
  /** Live only: abre a lista de canais por cima do video (botao e setas esquerda/direita). */
  onShowChannels?: () => void
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
  previous,
  onShowEpisodes,
  onChannelUp,
  onChannelDown,
  onShowChannels,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  // Fixo por navegador: decide se o HLS vai pelo player nativo (Safari) ou pelo hls.js.
  const [nativeHls] = useState(supportsNativeHls)
  const [levels, setLevels] = useState<QualityLevel[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1)
  const [autoPickedHeight, setAutoPickedHeight] = useState<number | null>(null)
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([])
  const [currentAudioTrack, setCurrentAudioTrack] = useState(-1)
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([])
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState(-1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const profileId = useActiveProfileId()
  const trackPref = usePlayerPrefs((s) => s.trackLang[profileId])
  const setTrackLang = usePlayerPrefs((s) => s.setTrackLang)
  const [openMenu, setOpenMenu] = useState<'quality' | 'audio' | 'subtitles' | 'speed' | 'display' | null>(null)
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
  const videoFit = usePlayerPrefs((s) => s.videoFit)
  const setVideoFit = usePlayerPrefs((s) => s.setVideoFit)
  const subtitleOffset = usePlayerPrefs((s) => s.subtitleOffset)
  const setSubtitleOffset = usePlayerPrefs((s) => s.setSubtitleOffset)
  const savedVolume = usePlayerPrefs((s) => s.volume)
  const setVolumePrefs = usePlayerPrefs((s) => s.setVolumePrefs)
  const subtitleSize = usePlayerPrefs((s) => s.subtitleSize)
  const subtitleBackground = usePlayerPrefs((s) => s.subtitleBackground)
  const setSubtitleSize = usePlayerPrefs((s) => s.setSubtitleSize)
  const setSubtitleBackground = usePlayerPrefs((s) => s.setSubtitleBackground)
  const playerId = useId().replace(/:/g, '')
  const [volume, setVolume] = useState(savedVolume)
  const [isMuted, setIsMuted] = useState(false)
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



  useVideoSource({
    videoRef, hlsRef, src, isHls, isLive, autoPlay, startAt, nativeHls, fastLive, retryToken, savedVolume, onProgress, onEnded,
    setVolumePrefs, setError, setBuffering, setLevels, setCurrentLevel, setUsingHlsJs, setAutoPickedHeight, setAudioTracks,
    setCurrentAudioTrack, setSubtitleTracks, setCurrentSubtitleTrack, setNeedsUnmutePrompt, setDownloadedPct, setNextUpVisible,
    setNextUpDismissed, setPlaybackRate, setDuration, setCurrentTime, setIsPlaying, setVolume, setIsMuted, setRetryToken,
  })
  useNativeHls({
    videoRef, src, isHls, isLive, nativeHls, fastLive, retryToken, setAudioTracks, setCurrentAudioTrack, setSubtitleTracks,
    setCurrentSubtitleTrack, setRetryToken,
  })

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

  useSubtitleOffset(videoRef, subtitleOffset, currentSubtitleTrack)
  const voiceBoost = usePlayerPrefs((s) => s.voiceBoost)
  useStereoDownmix(videoRef, isTv, voiceBoost)

  const [sleepMinutes, setSleepMinutes] = useSleepTimer(videoRef)

  // --- Auto-hide controls after inactivity while playing ---
  function wakeControls() {
    setControlsVisible(true)
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current)
    // Le o video na hora, nao o `isPlaying` da closure: os atalhos de teclado (controle da TV) guardam uma
    // closure antiga e, se ela era de quando estava pausado, os controles nunca mais sumiam.
    hideControlsTimeout.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false)
    }, 3000)
  }
  // TV: controles sumiram com o foco num botao invisivel -> solta o foco, para as setas voltarem a pular/zapear.
  useEffect(() => {
    if (isTv && !controlsVisible && document.activeElement instanceof HTMLElement && containerRef.current?.contains(document.activeElement)) {
      document.activeElement.blur()
    }
  }, [controlsVisible])
  useEffect(() => {
    if (!isPlaying) setControlsVisible(true)
    else wakeControls()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying])

  // Menu aberto vira uma entrada do historico, como a lista de canais: o Voltar do Android/Fire TV (MainActivity chama
  // webView.goBack(), sem tecla para o JS) fecha so o menu em vez de sair do player.
  const menuMarker = useRef(false)
  useEffect(() => {
    if (openMenu && !menuMarker.current) {
      history.pushState({ ...history.state, pfMenu: true }, '')
      menuMarker.current = true
    } else if (!openMenu && menuMarker.current) {
      menuMarker.current = false
      if (history.state?.pfMenu) history.back()
    }
  }, [openMenu])
  useEffect(() => {
    const onPop = () => {
      if (!menuMarker.current) return
      menuMarker.current = false
      setOpenMenu(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])


  useVideoPlayerKeys({
    videoRef, containerRef, isLive, onChannelUp, onChannelDown, onShowChannels, wakeControls, togglePlay, skip, setSpeed,
    toggleFullscreen, togglePip, closeMenu: () => setOpenMenu(null),
  })

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

  useWakeLock(isPlaying)

  useMediaSession({ videoRef, title, subtitle, poster, isPlaying, isLive, next, previous, skip, currentTime, duration, playbackRate })

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
    // Som preso pelo autoplay: o primeiro toque na tela so devolve o som, nao pausa quem esta assistindo junto.
    if (needsUnmutePrompt) return unmute()
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
        skip(side * SKIP_SECONDS)
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

  // Lista de faixas nova (video novo): abre no idioma que o perfil escolheu por ultimo, se o video tiver.
  useEffect(() => {
    const want = trackPref?.audio
    const idx = want ? audioTracks.findIndex((t) => trackKey(t) === want) : -1
    if (idx >= 0 && idx !== currentAudioTrack) applyAudioTrack(idx)
    // So quando a lista muda; a escolha manual ja grava a preferencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioTracks])
  useEffect(() => {
    const want = trackPref?.subtitle
    if (want === undefined || subtitleTracks.length === 0) return
    const idx = want === null ? -1 : subtitleTracks.findIndex((t) => trackKey(t) === want)
    if ((idx >= 0 || want === null) && idx !== currentSubtitleTrack) applySubtitleTrack(idx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitleTracks])

  function selectAudioTrack(id: number) {
    const track = audioTracks[id]
    if (track) setTrackLang(profileId, { audio: trackKey(track) })
    applyAudioTrack(id)
    setOpenMenu(null)
  }

  function applyAudioTrack(id: number) {
    if (hlsRef.current) hlsRef.current.audioTrack = id
    const nativeAudio = (videoRef.current as { audioTracks?: NativeAudioTrackList } | null)?.audioTracks
    if (!hlsRef.current && isHls && nativeHls && nativeAudio) {
      for (let i = 0; i < nativeAudio.length; i++) nativeAudio[i].enabled = i === id
    }
    setCurrentAudioTrack(id)
  }

  function selectSubtitleTrack(id: number) {
    const track = subtitleTracks[id]
    setTrackLang(profileId, { subtitle: track ? trackKey(track) : null })
    applySubtitleTrack(id)
    setOpenMenu(null)
  }

  function applySubtitleTrack(id: number) {
    if (hlsRef.current) hlsRef.current.subtitleTrack = id
    else if (isHls && nativeHls) nativeSubtitleTracks(videoRef.current).forEach((t, i) => (t.mode = i === id ? 'showing' : 'disabled'))
    setCurrentSubtitleTrack(id)
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

  return (
    <div
      ref={containerRef}
      id={playerId}
      className={`pf-video-player pf-cue-size-${subtitleSize} pf-cue-bg-${subtitleBackground} group/player relative h-full w-full touch-manipulation select-none bg-black ${controlsVisible ? '' : 'cursor-none'}`}
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
      <video ref={videoRef} className="h-full w-full" style={{ objectFit: videoFit }} playsInline poster={poster ?? undefined} />

      <VideoPlayerHeader
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        controlsVisible={controlsVisible}
        openMenu={openMenu}
        onToggleMenu={(menu) => setOpenMenu((m) => (m === menu ? null : menu))}
        videoFit={videoFit}
        onSelectFit={(fit) => {
          setVideoFit(fit)
          setOpenMenu(null)
        }}
        sleepRemaining={sleepMinutes}
        onSelectSleep={(minutes) => setSleepMinutes(minutes === 0 ? null : minutes)}
        subtitleOffset={subtitleOffset}
        onChangeSubtitleOffset={setSubtitleOffset}
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

      <VideoPlayerZappingControls
        isLive={isLive}
        controlsVisible={controlsVisible}
        error={error}
        onChannelUp={onChannelUp}
        onChannelDown={onChannelDown}
        onShowChannels={onShowChannels}
      />

      <VideoPlayerCenterOverlays
        error={error}
        nextUpVisible={nextUpVisible}
        next={next}
        onPlayNext={playNext}
        onDismissNextUp={() => {
          setNextUpVisible(false)
          setNextUpDismissed(true)
        }}
        seekFlash={seekFlash}
        buffering={buffering}
        downloadedPct={downloadedPct}
        showSlowHint={showSlowHint}
        needsUnmutePrompt={needsUnmutePrompt}
        onUnmute={unmute}
        isPlaying={isPlaying}
        isLive={isLive}
        controlsVisible={controlsVisible}
        onTogglePlay={togglePlay}
        onSkip={skip}
        onRetry={() => {
          setError(null)
          setRetryToken((t) => t + 1)
        }}
      />

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
          hasPrevious={Boolean(previous)}
          onPlayPrevious={() => previous?.onPlay()}
          hasNext={Boolean(next)}
          onPlayNext={playNext}
          onShowEpisodes={onShowEpisodes}
          fsSupported={fsSupported}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
    </div>
  )
}
