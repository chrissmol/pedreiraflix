import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { expectedPosition, type RemoteState, resumeRoom, sendState, useJunto } from '../lib/junto'

// Paineis abertos por cima do player (lista de canais, episodios) nao mudam o que se assiste.
const UI_PARAMS = ['canais', 'episodios']
function watchPath(pathname: string, search: string): string | null {
  if (!pathname.startsWith('/watch/') || pathname.startsWith('/watch/offline/')) return null
  const params = new URLSearchParams(search)
  for (const p of UI_PARAMS) params.delete(p)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

const SUPPRESS_MS = 1500

/** "Assistir junto", montado uma vez no app: segue o titulo da sala, aplica play/pausa/posicao no video da tela e manda
 * para a sala o que a pessoa faz no proprio player. So age com uma sala aberta (lib/junto.ts). */
export default function JuntoSync() {
  const location = useLocation()
  const navigate = useNavigate()
  const code = useJunto((s) => s.code)
  const people = useJunto((s) => s.people)
  const connected = useJunto((s) => s.connected)
  const remote = useJunto((s) => s.remote)
  const path = watchPath(location.pathname, location.search)
  // Logo depois de abrir o titulo da sala, o player toca sozinho e pula para o ponto salvo: nada disso vai para a sala.
  const suppressUntil = useRef(0)
  // O ultimo estado da sala que este aparelho conhece (recebido ou enviado por ele).
  const room = useRef<RemoteState | null>(null)

  useEffect(() => resumeRoom(), [])

  // Sala -> tela: outro titulo abre aqui; o mesmo titulo so acerta play/pausa/posicao.
  useEffect(() => {
    if (!remote) return
    room.current = remote
    if (watchPath(location.pathname, location.search) !== remote.path) {
      suppressUntil.current = Date.now() + 4000
      navigate(remote.path)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so quando chega estado novo, nao a cada troca de tela
  }, [remote])

  useEffect(() => {
    const target = room.current
    if (!code || !target || path !== target.path) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const apply = (last = false) => {
      const video = document.querySelector('video')
      if (cancelled || !video) return
      if (video.readyState < 1) {
        video.addEventListener('loadedmetadata', () => apply(last), { once: true })
        return
      }
      // Ao vivo nao tem posicao em comum entre aparelhos: so o canal e o play/pausa.
      const expected = target.path.startsWith('/watch/live/') ? null : expectedPosition(target)
      const seek = expected != null && Math.abs(video.currentTime - expected) > 1.5
      const play = target.playing && video.paused
      const pause = !target.playing && !video.paused
      if (seek) video.currentTime = expected
      if (play) video.play().catch(() => {})
      if (pause) video.pause()
      // Conferido de novo depois do pulo do proprio player: dali em diante o que a pessoa fizer vai para a sala.
      if (last) suppressUntil.current = 0
    }
    // O video da tela nova pode ainda nao existir; e o player pula para o ponto salvo ao carregar, entao confere de novo.
    const start = () => {
      if (cancelled) return
      if (!document.querySelector('video')) timer = setTimeout(start, 200)
      else {
        apply()
        timer = setTimeout(() => apply(true), SUPPRESS_MS)
      }
    }
    start()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [code, path, remote])

  // Tela -> sala: play, pausa e pulo feitos aqui.
  useEffect(() => {
    if (!code || !path) return
    let video: HTMLVideoElement | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const send = () => {
      // Sair do player tira o video da pagina e o navegador solta um "pause": isso nao pausa a sala.
      if (!video || !video.isConnected || Date.now() < suppressUntil.current) return
      const state = { path, playing: !video.paused, pos: video.currentTime }
      // Igual ao que a sala ja tem e eco do que veio dela (ou nao mudou nada): nao volta.
      const known = room.current
      const live = path.startsWith('/watch/live/')
      if (known && known.path === path && known.playing === state.playing && (live || Math.abs(expectedPosition(known) - state.pos) < 2)) return
      room.current = { ...state, age: 0, receivedAt: Date.now() }
      sendState(state)
    }
    const attach = () => {
      video = document.querySelector('video')
      if (!video) {
        timer = setTimeout(attach, 300)
        return
      }
      for (const ev of ['play', 'pause', 'seeked'] as const) video.addEventListener(ev, send)
    }
    attach()
    return () => {
      clearTimeout(timer)
      if (video) for (const ev of ['play', 'pause', 'seeked'] as const) video.removeEventListener(ev, send)
    }
  }, [code, path])

  if (!code) return null
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-1/2 z-[60] -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-label-md text-white shadow-lg backdrop-blur sm:bottom-6"
    >
      <span className={`mr-2 inline-block h-2 w-2 rounded-full ${connected ? 'bg-done' : 'bg-live'}`} />
      Assistindo junto · {code} · {people === 1 ? 'só você' : `${people} pessoas`}
    </div>
  )
}
