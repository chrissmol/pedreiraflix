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
