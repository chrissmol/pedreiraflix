import { type RefObject, useEffect, useRef, useState } from 'react'
import { SKIP_SECONDS } from './videoPlayerUtils'

// Efeitos do player sem relacao com o hls.js: cada um recebe so o que usa (antes viviam soltos nas 1000+ linhas
// do VideoPlayer.tsx). A ordem em que o VideoPlayer os chama e a mesma de antes.

// --- Sincronia da legenda: desloca as cues quando o provedor manda a legenda adiantada/atrasada. ---
// Mexer em `startTime`/`endTime` das cues e o unico jeito no navegador; e feito sobre o delta desde a
// ultima aplicacao para o ajuste ser cumulativo sem recarregar a faixa. O audio NAO tem equivalente:
// nao existe API para deslocar o audio de um <video> sem reencaminhar pelo Web Audio, o que quebraria
// AirPlay/Chromecast — por isso so a legenda e ajustavel aqui.
export function useSubtitleOffset(videoRef: RefObject<HTMLVideoElement | null>, subtitleOffset: number, currentSubtitleTrack: number) {
  const applied = useRef(0)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const delta = subtitleOffset - applied.current
    if (delta === 0) return
    for (const track of Array.from(video.textTracks)) {
      for (const cue of Array.from(track.cues ?? [])) {
        cue.startTime = Math.max(0, cue.startTime + delta)
        cue.endTime = Math.max(0, cue.endTime + delta)
      }
    }
    applied.current = subtitleOffset
  }, [videoRef, subtitleOffset, currentSubtitleTrack])
}

// --- Sleep timer: pausa sozinho depois de N minutos, para dormir assistindo. ---
// Pausa em vez de fechar a tela: quem acordar no meio continua de onde parou, e o progresso ja foi
// salvo pelo fluxo normal de reproducao.
export function useSleepTimer(videoRef: RefObject<HTMLVideoElement | null>) {
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null)
  useEffect(() => {
    if (sleepMinutes == null) return
    const timer = setTimeout(() => {
      videoRef.current?.pause()
      setSleepMinutes(null)
    }, sleepMinutes * 60_000)
    return () => clearTimeout(timer)
  }, [videoRef, sleepMinutes])
  return [sleepMinutes, setSleepMinutes] as const
}

// --- Wake Lock: keeps the screen on while actively playing (phones/tablets dim and lock otherwise). ---
export function useWakeLock(isPlaying: boolean) {
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
}

interface MediaSessionOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  title?: string
  subtitle?: string
  poster?: string | null
  isPlaying: boolean
  isLive: boolean
  next?: { onPlay: () => void } | null
  previous?: { onPlay: () => void } | null
  skip: (seconds: number) => void
  currentTime: number
  duration: number
  playbackRate: number
}

// --- Media Session: lock-screen / notification-shade transport controls and metadata, e a posicao do scrubber. ---
export function useMediaSession(o: MediaSessionOptions) {
  const { videoRef, title, subtitle, poster, isPlaying, isLive, next, previous, skip, currentTime, duration, playbackRate } = o

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
      navigator.mediaSession.setActionHandler('seekbackward', () => skip(-SKIP_SECONDS))
      navigator.mediaSession.setActionHandler('seekforward', () => skip(SKIP_SECONDS))
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (videoRef.current && details.seekTime != null) videoRef.current.currentTime = details.seekTime
      })
    }
    navigator.mediaSession.setActionHandler('nexttrack', next ? next.onPlay : null)
    navigator.mediaSession.setActionHandler('previoustrack', previous ? previous.onPlay : null)
    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('seekbackward', null)
      navigator.mediaSession.setActionHandler('seekforward', null)
      navigator.mediaSession.setActionHandler('seekto', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
    }
    // `skip` e recriada a cada render; o que muda de verdade esta na lista (igual ao codigo de antes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, subtitle, poster, isPlaying, isLive, next, previous])

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
}

// --- Audio 5.1 misturado em estereo ---
// Suspeita (Chris, 22/10): filme 5.1 na TV sai sem a voz dos atores, porque a voz fica no canal central e a TV de
// dois alto-falantes o descartaria. Passar o som pelo Web Audio forca a mistura: a saida tem 2 canais e a regra
// "speakers" soma o central na esquerda e na direita. Por enquanto so o teste de som dos Ajustes usa; o player so
// liga depois de confirmado numa TV real (e so na TV: no celular/PC o Web Audio quebraria AirPlay/Chromecast).
let audioCtx: AudioContext | null = null
const routed = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()

/** Liga o som do elemento na mistura estereo; true se o som passou a sair por ela. */
export async function routeToStereo(el: HTMLMediaElement): Promise<boolean> {
  if (typeof AudioContext === 'undefined') return false
  const node = routed.get(el)
  if (node && audioCtx) {
    node.connect(audioCtx.destination) // repetir a mesma ligacao nao faz nada
    await audioCtx.resume().catch(() => {}) // volta de segundo plano com o contexto suspenso
    return true
  }
  // Midia de outra origem sem CORS sai muda pelo Web Audio; o proxy /api/stream e o blob: do hls.js sao daqui.
  if (!el.currentSrc.startsWith('blob:') && new URL(el.currentSrc, location.href).origin !== location.origin) return false
  audioCtx ??= new AudioContext()
  await audioCtx.resume().catch(() => {})
  // Contexto parado (sem toque do usuario) deixaria o filme mudo: so desvia o som com ele rodando.
  if (audioCtx.state !== 'running' || routed.has(el)) return routed.has(el)
  const source = audioCtx.createMediaElementSource(el)
  source.connect(audioCtx.destination)
  routed.set(el, source)
  return true
}
