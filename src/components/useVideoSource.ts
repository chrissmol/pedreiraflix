import type Hls from 'hls.js'
import type { RefObject } from 'react'
import { useEffect, useRef } from 'react'
import { useJunto } from '../lib/junto'
import { LIVE_AUTO_RETRY_MS, type AudioTrack, type Setter, type SubtitleTrack } from './videoPlayerTracks'
import type { QualityLevel } from './VideoPlayerQualityMenu'
import {
  CHANNEL_BLOCKED_MESSAGE,
  CHANNEL_NOT_FOUND_MESSAGE,
  estimateInitialBandwidthBps,
  refusedMessage,
} from './videoPlayerUtils'

interface Params {
  videoRef: RefObject<HTMLVideoElement | null>
  hlsRef: RefObject<Hls | null>
  src: string
  isHls: boolean
  isLive: boolean
  autoPlay: boolean
  startAt: number
  nativeHls: boolean
  fastLive: boolean
  retryToken: number
  savedVolume: number
  onProgress?: (currentTime: number, duration: number) => void
  onEnded?: () => void
  setVolumePrefs: (volume: number, muted: boolean) => void
  setError: Setter<string | null>
  setBuffering: Setter<boolean>
  setLevels: Setter<QualityLevel[]>
  setCurrentLevel: Setter<number>
  setUsingHlsJs: Setter<boolean>
  setAutoPickedHeight: Setter<number | null>
  setAudioTracks: Setter<AudioTrack[]>
  setCurrentAudioTrack: Setter<number>
  setSubtitleTracks: Setter<SubtitleTrack[]>
  setCurrentSubtitleTrack: Setter<number>
  setNeedsUnmutePrompt: Setter<boolean>
  setDownloadedPct: Setter<number | null>
  setNextUpVisible: Setter<boolean>
  setNextUpDismissed: Setter<boolean>
  setPlaybackRate: Setter<number>
  setDuration: Setter<number>
  setCurrentTime: Setter<number>
  setIsPlaying: Setter<boolean>
  setVolume: Setter<number>
  setIsMuted: Setter<boolean>
  setRetryToken: Setter<number>
}

export function useVideoSource({
  videoRef,
  hlsRef,
  src,
  isHls,
  isLive,
  autoPlay,
  startAt,
  nativeHls,
  fastLive,
  retryToken,
  savedVolume,
  onProgress,
  onEnded,
  setVolumePrefs,
  setError,
  setBuffering,
  setLevels,
  setCurrentLevel,
  setUsingHlsJs,
  setAutoPickedHeight,
  setAudioTracks,
  setCurrentAudioTrack,
  setSubtitleTracks,
  setCurrentSubtitleTrack,
  setNeedsUnmutePrompt,
  setDownloadedPct,
  setNextUpVisible,
  setNextUpDismissed,
  setPlaybackRate,
  setDuration,
  setCurrentTime,
  setIsPlaying,
  setVolume,
  setIsMuted,
  setRetryToken,
}: Params) {
  const volumeSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  // No HLS nativo o "Rápido" nao reconfigura nada (ver useNativeHls), entao nao recarrega o video.
  const hlsJsFastLive = nativeHls ? false : fastLive

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
      // "Assistir junto" espera todo mundo carregar: quem abriu o titulo so toca quando a sala mandar.
      if (!autoPlay || !video || !video.paused || useJunto.getState().waiting) return
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
}
