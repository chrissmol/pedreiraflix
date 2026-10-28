import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useXtream } from '../hooks/useXtream'
import { expectedPosition, type JuntoRef, refFor, type RemoteState, resumeRoom, sendState, useJunto } from '../lib/junto'
import { resolveRef, warmCatalog } from '../lib/juntoResolve'

// Paineis abertos por cima do player (lista de canais, episodios) nao mudam o que se assiste.
const UI_PARAMS = ['canais', 'episodios']
function watchPath(pathname: string, search: string): string | null {
  if (!pathname.startsWith('/watch/') || pathname.startsWith('/watch/offline/')) return null
  const params = new URLSearchParams(search)
  for (const p of UI_PARAMS) params.delete(p)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

const sameRef = (a?: JuntoRef, b?: JuntoRef) => !!a && !!b && a.k === b.k && a.t === b.t && a.s === b.s && a.e === b.e
/** O caminho no formato que a tela usa (URLSearchParams grafa espaco como "+", encodeURIComponent como "%20"): sem isso
 * o caminho achado no catalogo nunca era igual ao da tela e play/pausa/pulo da sala nao eram aplicados. */
const canon = (p: string) => {
  const i = p.indexOf('?')
  return (i < 0 ? watchPath(p, '') : watchPath(p.slice(0, i), p.slice(i))) ?? p
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
  const client = useXtream()
  const path = watchPath(location.pathname, location.search)
  // O estado da sala ja no caminho desta conta (ids de filme/serie/canal mudam de provedor para provedor).
  const [target, setTarget] = useState<RemoteState | null>(null)
  // Titulo que a sala assiste e esta conta nao tem: nao segue a sala nem manda nada para ela.
  const [missing, setMissing] = useState<string | null>(null)
  const missingRef = useRef<string | null>(null)
  // Logo depois de abrir o titulo da sala, o player toca sozinho e pula para o ponto salvo: nada disso vai para a sala.
  const suppressUntil = useRef(0)
  // O ultimo estado da sala que este aparelho conhece (recebido ou enviado por ele).
  const room = useRef<RemoteState | null>(null)

  useEffect(() => resumeRoom(), [])
  useEffect(() => {
    if (code && client) warmCatalog(client)
  }, [code, client])

  // Sala -> tela: outro titulo abre aqui; o mesmo titulo so acerta play/pausa/posicao.
  useEffect(() => {
    if (!remote) return
    let cancelled = false
    ;(async () => {
      let next = remote
      const here = watchPath(location.pathname, location.search)
      // Ja assistindo esse titulo: so play/pausa/pulo, sem olhar o catalogo (que pode ser enorme e lento).
      if (remote.ref && here && sameRef(refFor(here), remote.ref)) next = { ...remote, path: here }
      else if (remote.ref && client) {
        try {
          const mine = await resolveRef(client, remote.ref, remote.path)
          if (cancelled) return
          if (!mine) {
            missingRef.current = remote.ref.t
            setMissing(remote.ref.t)
            return
          }
          next = { ...remote, path: canon(mine) }
        } catch {
          // sem conseguir olhar o catalogo: tenta o caminho da sala como veio
        }
      }
      missingRef.current = null
      setMissing(null)
      room.current = next
      setTarget(next)
      if (watchPath(location.pathname, location.search) !== next.path) {
        suppressUntil.current = Date.now() + 4000
        navigate(next.path)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so quando chega estado novo, nao a cada troca de tela
  }, [remote])

  useEffect(() => {
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
  }, [code, path, target])

  // Tela -> sala: play, pausa e pulo feitos aqui.
  useEffect(() => {
    if (!code || !path) return
    let video: HTMLVideoElement | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const send = () => {
      // Sair do player tira o video da pagina e o navegador solta um "pause": isso nao pausa a sala.
      if (!video || !video.isConnected || missingRef.current || Date.now() < suppressUntil.current) return
      const state = { path, playing: !video.paused, pos: video.currentTime, ref: refFor(path) }
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
      {missing ? `Sua conta não tem «${missing}»` : `Assistindo junto · ${code} · ${people === 1 ? 'só você' : `${people} pessoas`}`}
    </div>
  )
}
