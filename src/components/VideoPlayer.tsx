import type Hls from 'hls.js'
import { useEffect, useId, useRef, useState } from 'react'
import { useAirPlay } from '../hooks/useAirPlay'
import { castMedia, ensureCastSdk } from '../lib/cast'
import { isTv } from '../lib/device'
import { moveFocusTv } from '../lib/spatialNav'
import { usePlayerPrefs } from '../store/playerPrefs'
import { useActiveProfileId } from '../store/profiles'
import { VideoPlayerBottomControls } from './VideoPlayerBottomControls'
import { VideoPlayerCenterOverlays } from './VideoPlayerCenterOverlays'
import { VideoPlayerHeader } from './VideoPlayerHeader'
import type { QualityLevel } from './VideoPlayerQualityMenu'
import { VideoPlayerZappingControls } from './VideoPlayerZappingControls'
import { useMediaSession, useSleepTimer, useStereoDownmix, useSubtitleOffset, useWakeLock } from './useVideoPlayerEffects'
import {
  NEXT_UP_LEAD,
  CHANNEL_BLOCKED_MESSAGE,
  CHANNEL_NOT_FOUND_MESSAGE,
  SKIP_SECONDS,
  estimateInitialBandwidthBps,
  refusedMessage,
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

interface AudioTrack {
  id: number
  name: string
  lang?: string
}

interface SubtitleTrack {
  id: number
  name: string
  lang?: string
}

/** Como o idioma preferido e guardado e comparado: o codigo da faixa ("por"), senao o nome ("Português"). */
const trackKey = (t: { name: string; lang?: string }) => (t.lang || t.name).toLowerCase()

// AudioTrackList so existe no Safari; o lib.dom do TypeScript nao a declara.
interface NativeAudioTrackList extends EventTarget {
  readonly length: number
  [index: number]: { label: string; language: string; enabled: boolean }
}

// Atraso (s) atras do ponto ao vivo a partir do qual o "Rápido" do HLS nativo pula de volta.
const NATIVE_FAST_MAX_LAG = 6
const NATIVE_STALL_MS = 15_000
const LIVE_AUTO_RETRY_MS = 20_000

function nativeSubtitleTracks(video: HTMLVideoElement | null) {
  return Array.from(video?.textTracks ?? []).filter((t) => t.kind === 'subtitles' || t.kind === 'captions')
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

  // No HLS nativo o "Rápido" nao reconfigura nada (ver os efeitos abaixo), entao nao recarrega o video.
  const hlsJsFastLive = nativeHls ? false : fastLive

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
    // Sempre abre com som: um mudo salvo (inclusive o que versoes antigas gravaram sozinhas pelo autoplay) deixava o
    // convidado da sala sem som e sem o botao "Ativar som". O volume continua o da ultima vez.
    video.muted = false
    // Playback rate is a per-title choice (e.g. lectures vs. movies), not a saved preference, so each new title starts at 1x.
    video.playbackRate = 1
    setPlaybackRate(1)

    let hls: Hls | null = null
    let cancelled = false
    let networkRetries = 0
    const MAX_NETWORK_RETRIES = 4
    // Mudo imposto pela regra de autoplay (nao escolha da pessoa): nao vai para as preferencias, senao o proximo titulo
    // (ex.: o da sala do "Assistir junto") ja comecaria mudo, sem o botao "Ativar som".
    let forcedMute = false

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
    // O <video> nao expoe o status HTTP, entao quando ele falha (MP4, ou HLS nativo do Safari/AirPlay —
    // o hls.js trata os proprios erros) um pedido de 1 byte descobre se foi o provedor recusando.
    function onVideoError() {
      if (hls || !video) return
      const fallback = isHls
        ? 'Erro ao carregar o stream. Verifique a conexão ou o canal.'
        : 'Não foi possível reproduzir este arquivo. Formato pode não ser suportado pelo navegador.'
      fetch(video.currentSrc || src, { headers: { Range: 'bytes=0-0' } })
        .then(async (res) => {
          const msg = res.status === 403 ? await refusedMessage() : fallback
          if (!cancelled) setError(msg)
        })
        .catch(() => !cancelled && setError(fallback))
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
        forcedMute = true
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
      if (!video.muted) {
        setNeedsUnmutePrompt(false)
        forcedMute = false
      }
      if (forcedMute) return
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
      if (isHls && !nativeHls) {
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

          hls.on(HlsCtor.Events.LEVEL_LOADED, (_evt, data) => {
            if (cancelled || !isLive || data.details.live) return
            hls?.destroy()
            refusedMessage(CHANNEL_BLOCKED_MESSAGE).then((msg) => !cancelled && setError(msg))
          })
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
              data.audioTracks.map((t, i) => ({ id: i, name: t.name || t.lang || `Faixa ${i + 1}`, lang: t.lang })),
            )
            setCurrentAudioTrack(hls?.audioTrack ?? -1)
          })
          hls.on(HlsCtor.Events.AUDIO_TRACK_SWITCHED, (_evt, data) => {
            if (!cancelled) setCurrentAudioTrack(data.id)
          })
          hls.on(HlsCtor.Events.SUBTITLE_TRACKS_UPDATED, (_evt, data) => {
            if (cancelled) return
            setSubtitleTracks(
              data.subtitleTracks.map((t, i) => ({ id: i, name: t.name || t.lang || `Faixa ${i + 1}`, lang: t.lang })),
            )
          })

          hls.on(HlsCtor.Events.ERROR, (_evt, data) => {
            // Lista do canal com 404 o hls.js repete sem fim e sem erro fatal (console do Christian, 09/10: ~35x o
            // mesmo /auth/<token>). Com 1 tela na conta, insistir segura a tela no provedor e ele recusa tudo.
            const isPlaylist =
              data.details === HlsCtor.ErrorDetails.MANIFEST_LOAD_ERROR || data.details === HlsCtor.ErrorDetails.LEVEL_LOAD_ERROR
            if (isPlaylist && data.response?.code === 404) {
              setError(CHANNEL_NOT_FOUND_MESSAGE)
              hls?.destroy()
              return
            }
            if (!data.fatal) return
            switch (data.type) {
              case HlsCtor.ErrorTypes.NETWORK_ERROR:
                // Recusa do provedor nao melhora tentando de novo — so gastaria as 4 tentativas.
                if (data.response?.code === 403) {
                  hls?.destroy()
                  refusedMessage().then((msg) => !cancelled && setError(msg))
                  break
                }
                networkRetries += 1
                if (networkRetries <= MAX_NETWORK_RETRIES) {
                  setBuffering(true)
                  hls?.startLoad()
                } else {
                  setError('Sinal instável: não foi possível reconectar ao stream.')
                  // Ao vivo (TV, Windows, site): sem isto o canal ficava parado ate alguem apertar "Tentar novamente".
                  if (isLive) setTimeout(() => !cancelled && setRetryToken((t) => t + 1), LIVE_AUTO_RETRY_MS)
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
        // VOD, or a browser (Safari) with native HLS support — see supportsNativeHls().
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
      // Solta o video de verdade. Sem isto, sair do player deixava o <video> baixando em segundo plano ate o navegador
      // descartar o elemento — e cada conexao aberta conta no limite de telas do provedor: depois de assistir e sair
      // algumas vezes ele passava a recusar tudo (HTTP 403, "sua conta ja esta tocando em outro aparelho") sem ninguem
      // assistindo (app do Windows do Christian, 09/10). removeAttribute + load() cancela o pedido em andamento.
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, isHls, retryToken, hlsJsFastLive])

  // --- Safari (HLS nativo): faixas de audio/legenda e o "Rápido" pelo proprio <video> ---
  // Sem hls.js os menus ficavam vazios; o Safari expoe as faixas do manifesto em audioTracks/textTracks.
  useEffect(() => {
    const video = videoRef.current as (HTMLVideoElement & { audioTracks?: NativeAudioTrackList }) | null
    if (!video || !isHls || !nativeHls) return
    const audio = video.audioTracks
    const text = video.textTracks
    function syncAudio() {
      if (!audio) return
      const list = Array.from({ length: audio.length }, (_, i) => audio[i])
      setAudioTracks(list.map((t, i) => ({ id: i, name: t.label || t.language || `Faixa ${i + 1}`, lang: t.language })))
      setCurrentAudioTrack(list.findIndex((t) => t.enabled))
    }
    function syncText() {
      const list = nativeSubtitleTracks(video)
      setSubtitleTracks(list.map((t, i) => ({ id: i, name: t.label || t.language || `Faixa ${i + 1}`, lang: t.language })))
      setCurrentSubtitleTrack(list.findIndex((t) => t.mode === 'showing'))
    }
    syncAudio()
    syncText()
    audio?.addEventListener('addtrack', syncAudio)
    audio?.addEventListener('change', syncAudio)
    text.addEventListener('addtrack', syncText)
    text.addEventListener('change', syncText)
    return () => {
      audio?.removeEventListener('addtrack', syncAudio)
      audio?.removeEventListener('change', syncAudio)
      text.removeEventListener('addtrack', syncText)
      text.removeEventListener('change', syncText)
    }
  }, [src, isHls, nativeHls, retryToken])

  // O Safari nao deixa mexer no buffer do HLS nativo, entao aqui o "Rápido" segura o video no ponto ao vivo:
  // quando ele fica para tras (travada, pausa), pula de volta para o fim da janela que o Safari considera tocavel.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isLive || !nativeHls || !fastLive) return
    function chase() {
      if (!video || video.paused || !video.seekable.length) return
      const edge = video.seekable.end(video.seekable.length - 1)
      if (edge - video.currentTime > NATIVE_FAST_MAX_LAG) video.currentTime = edge
    }
    chase()
    video.addEventListener('timeupdate', chase)
    return () => video.removeEventListener('timeupdate', chase)
  }, [isLive, nativeHls, fastLive, src])

  // Safari (HLS nativo) nao tem o retry do hls.js: se o provedor engasga, o video fica em "carregando" para sempre.
  // Parado ha NATIVE_STALL_MS sem voltar a tocar, recarrega a fonte (ate 3x seguidas; tocar de novo zera a conta).
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isLive || !nativeHls) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let reloads = 0
    function onStall() {
      if (timer || reloads >= 3) return
      timer = setTimeout(() => {
        timer = null
        reloads += 1
        setRetryToken((t) => t + 1)
      }, NATIVE_STALL_MS)
    }
    function onOk() {
      if (timer) clearTimeout(timer)
      timer = null
      reloads = 0
    }
    video.addEventListener('waiting', onStall)
    video.addEventListener('stalled', onStall)
    video.addEventListener('playing', onOk)
    return () => {
      if (timer) clearTimeout(timer)
      video.removeEventListener('waiting', onStall)
      video.removeEventListener('stalled', onStall)
      video.removeEventListener('playing', onOk)
    }
  }, [isLive, nativeHls, src])

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

  // --- Keyboard shortcuts ---
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const video = videoRef.current
      if (!video) return
      const focused = document.activeElement
      // Voltar do controle fecha o menu aberto (antes so a lista de canais e os Episodios fechavam).
      const openPanel = containerRef.current?.querySelector('[data-controls] .menu-panel')
      if ((e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack' || e.key === 'XF86Back' || e.keyCode === 10009) && openPanel) {
        e.preventDefault()
        ;(openPanel.previousElementSibling as HTMLElement | null)?.focus() // o foco volta para o botao do menu, nao some
        setOpenMenu(null)
        return
      }
      // Na TV a barra de progresso tambem e um <input>, mas as setas nela sao do player (abaixo), nao do navegador.
      if ((focused instanceof HTMLInputElement && !(isTv && focused.type === 'range')) || focused instanceof HTMLTextAreaElement) {
        return
      }
      // TV (controle remoto: so setas e OK). Com um botao do player focado, as setas andam entre os botoes e o OK
      // aperta o botao (o navegador ja faz isso). Sem nada focado, o OK mostra os controles e foca o Play/Pause;
      // fora do ao vivo subir/descer tambem (a TV tem volume proprio). Esquerda/direita seguem pulando 10 s e, no
      // ao vivo, subir/descer seguem zapeando.
      if (isTv) {
        const dirs: Record<string, 'up' | 'down' | 'left' | 'right'> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
        const dir = dirs[e.key]
        const active = document.activeElement
        if (active instanceof HTMLElement && active.closest('[data-controls]')) {
          if (dir) {
            e.preventDefault()
            // Na barra de progresso, esquerda/direita pulam 10 s (a previa mostra o tempo); subir/descer saem dela.
            // Dos botoes de baixo, subir vai para a barra: pelo centro, a barra larga perdia para o Voltar do topo.
            const bar = containerRef.current?.querySelector<HTMLElement>('[aria-label="Progresso"]')
            if (active === bar && (dir === 'left' || dir === 'right')) skip(dir === 'left' ? -SKIP_SECONDS : SKIP_SECONDS)
            else if (bar && dir === 'up' && active !== bar && active.closest('[data-controls]') === bar.closest('[data-controls]')) bar.focus()
            // Para os lados na fileira de botoes, a barra fica de fora: o centro dela (meio da tela) ganhava dos botoes
            // da direita (anterior/proximo/Episodios/tela cheia), que ficavam inalcancaveis no controle.
            else moveFocusTv(dir, dir === 'left' || dir === 'right' ? bar : null)
          }
          wakeControls()
          return
        }
        if (e.key === 'Enter' || (!isLive && (dir === 'up' || dir === 'down'))) {
          e.preventDefault()
          wakeControls()
          // Ha dois Play/Pause (o do centro so aparece no toque); o primeiro do DOM pode estar escondido e nao pega foco.
          const playPause = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[aria-label="Play/Pause"]') ?? []).find((el) => el.offsetParent)
          if (playPause) playPause.focus()
          else togglePlay()
          return
        }
      }
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          togglePlay()
          break
        // No ao vivo nao ha o que pular: esquerda/direita abrem a lista de canais (como o TiviMate).
        case 'ArrowLeft':
          if (isLive && onShowChannels) return onShowChannels()
          if (!isLive) video.currentTime = Math.max(0, video.currentTime - 10)
          wakeControls()
          break
        case 'ArrowRight':
          if (isLive && onShowChannels) return onShowChannels()
          if (!isLive) video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10)
          wakeControls()
          break
        // No ao vivo as setas verticais zapeiam (o que todo app de IPTV faz); fora dele nao havia o que
        // zapear e elas nao faziam nada, entao assumem o volume, como YouTube e Netflix.
        case 'ArrowUp':
          e.preventDefault()
          if (isLive && onChannelUp) onChannelUp()
          else {
            video.muted = false
            video.volume = Math.min(1, Math.round((video.volume + 0.05) * 100) / 100)
            wakeControls()
          }
          break
        case 'ArrowDown':
          e.preventDefault()
          if (isLive && onChannelDown) onChannelDown()
          else {
            video.volume = Math.max(0, Math.round((video.volume - 0.05) * 100) / 100)
            wakeControls()
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
  }, [isLive, onChannelUp, onChannelDown, onShowChannels])

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
