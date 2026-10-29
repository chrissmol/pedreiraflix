import type { RefObject } from 'react'
import { useEffect } from 'react'
import { isTv } from '../lib/device'
import { moveFocusTv } from '../lib/spatialNav'
import { SKIP_SECONDS } from './videoPlayerUtils'

interface Params {
  videoRef: RefObject<HTMLVideoElement | null>
  containerRef: RefObject<HTMLDivElement | null>
  isLive: boolean
  onChannelUp?: () => void
  onChannelDown?: () => void
  onShowChannels?: () => void
  closeMenu: () => void
  wakeControls: () => void
  togglePlay: () => void
  skip: (seconds: number) => void
  setSpeed: (rate: number) => void
  toggleFullscreen: () => void
  togglePip: () => void
}

export function useVideoPlayerKeys({
  videoRef,
  containerRef,
  isLive,
  onChannelUp,
  onChannelDown,
  onShowChannels,
  closeMenu,
  wakeControls,
  togglePlay,
  skip,
  setSpeed,
  toggleFullscreen,
  togglePip,
}: Params) {
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
        closeMenu()
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
}
