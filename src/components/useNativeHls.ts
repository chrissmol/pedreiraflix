import type { RefObject } from 'react'
import { useEffect } from 'react'
import { NATIVE_FAST_MAX_LAG, NATIVE_STALL_MS, nativeSubtitleTracks, type AudioTrack, type NativeAudioTrackList, type Setter, type SubtitleTrack } from './videoPlayerTracks'

interface Params {
  videoRef: RefObject<HTMLVideoElement | null>
  src: string
  isHls: boolean
  isLive: boolean
  nativeHls: boolean
  fastLive: boolean
  retryToken: number
  setAudioTracks: Setter<AudioTrack[]>
  setCurrentAudioTrack: Setter<number>
  setSubtitleTracks: Setter<SubtitleTrack[]>
  setCurrentSubtitleTrack: Setter<number>
  setRetryToken: Setter<number>
}

export function useNativeHls({
  videoRef,
  src,
  isHls,
  isLive,
  nativeHls,
  fastLive,
  retryToken,
  setAudioTracks,
  setCurrentAudioTrack,
  setSubtitleTracks,
  setCurrentSubtitleTrack,
  setRetryToken,
}: Params) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, nativeHls, src])
}
