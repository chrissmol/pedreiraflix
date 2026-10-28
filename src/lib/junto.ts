import { create } from 'zustand'

// "Assistir junto": cliente da sala do Worker (worker/junto.js). Um WebSocket por aparelho; o estado que chega (titulo,
// tocando ou pausado, posicao) e aplicado pelo useJuntoSync no player. O codigo fica no sessionStorage: recarregar a
// pagina volta para a mesma sala, fechar o app sai dela.

/** O titulo sem ids do provedor: cada aparelho acha o mesmo filme/serie/canal no catalogo da propria conta. */
export interface JuntoRef {
  k: 'movie' | 'series' | 'live'
  t: string
  s?: number
  e?: number
}
export interface JuntoState {
  path: string
  playing: boolean
  pos: number
  ref?: JuntoRef
}
/** Estado vindo da sala, com quando chegou (para somar o tempo que passou ate ser aplicado). */
export interface RemoteState extends JuntoState {
  receivedAt: number
  age: number
}

interface JuntoStore {
  code: string | null
  connected: boolean
  people: number
  remote: RemoteState | null
}

/** Onde o video da sala deveria estar agora: a posicao enviada mais o tempo que passou, se estava tocando. */
export function expectedPosition(remote: RemoteState, now = Date.now()): number {
  return remote.pos + (remote.playing ? (remote.age + now - remote.receivedAt) / 1000 : 0)
}

export function validRef(r: unknown): JuntoRef | undefined {
  const o = r as Partial<JuntoRef> | null
  if (!o || !['movie', 'series', 'live'].includes(o.k as string) || typeof o.t !== 'string' || !o.t || o.t.length > 200) return undefined
  const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : undefined)
  return { k: o.k as JuntoRef['k'], t: o.t, s: num(o.s), e: num(o.e) }
}

/** O que a tela aberta diz sobre o titulo (a WatchPage registra); so vale para o filme/episodio/canal em que foi registrado. */
let myRef: { at: string; ref: JuntoRef } | null = null
const where = (path: string) => path.match(/^\/watch\/(\w+)\/([^/?]+)/)?.slice(1, 3).join('/')
export const setMyRef = (kind: string, id: string, ref: JuntoRef | null) => {
  myRef = ref ? { at: `${kind}/${id}`, ref } : null
}
export const refFor = (path: string) => (myRef && myRef.at === where(path) ? myRef.ref : undefined)

export const useJunto = create<JuntoStore>(() => ({ code: null, connected: false, people: 0, remote: null }))

const KEY = 'pf-junto'
// Sem 0/O e 1/I: o codigo e lido em voz alta ou digitado no controle da TV.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)

let socket: WebSocket | null = null
let queued: JuntoState | null = null
let retry: ReturnType<typeof setTimeout> | undefined
let attempts = 0

function connect(code: string) {
  clearTimeout(retry)
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/junto/${code}`)
  socket = ws
  ws.onopen = () => {
    attempts = 0
    useJunto.setState({ connected: true })
    // O que a pessoa fez enquanto reconectava (recarregou o player e deu play logo) nao se perde.
    if (queued) ws.send(JSON.stringify({ t: 'estado', ...queued }))
    queued = null
  }
  ws.onmessage = (e) => {
    let msg: { t?: string; n?: number } & Partial<RemoteState>
    try {
      msg = JSON.parse(String(e.data))
    } catch {
      return
    }
    if (msg.t === 'pessoas' && typeof msg.n === 'number') useJunto.setState({ people: msg.n })
    if (msg.t === 'estado' && typeof msg.path === 'string' && typeof msg.pos === 'number' && typeof msg.playing === 'boolean') {
      useJunto.setState({ remote: { path: msg.path, playing: msg.playing, pos: msg.pos, ref: validRef(msg.ref), age: Number(msg.age) || 0, receivedAt: Date.now() } })
    }
  }
  ws.onclose = () => {
    if (socket !== ws) return
    socket = null
    useJunto.setState({ connected: false })
    // Caiu (rede, celular dormiu): volta sozinho enquanto a pessoa nao saiu da sala.
    if (useJunto.getState().code === code) retry = setTimeout(() => connect(code), Math.min(30_000, 1000 * 2 ** attempts++))
  }
}

export function joinRoom(code: string) {
  leaveRoom()
  try {
    sessionStorage.setItem(KEY, code)
  } catch {
    // sem sessionStorage: so nao volta sozinho ao recarregar
  }
  useJunto.setState({ code, people: 0, remote: null })
  connect(code)
}

export function leaveRoom() {
  clearTimeout(retry)
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // idem
  }
  const ws = socket
  socket = null
  queued = null
  ws?.close()
  useJunto.setState({ code: null, connected: false, people: 0, remote: null })
}

export function sendState(state: JuntoState) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'estado', ...state }))
  else queued = state
}

/** Volta para a sala depois de recarregar a pagina. */
export function resumeRoom() {
  let code: string | null = null
  try {
    code = sessionStorage.getItem(KEY)
  } catch {
    return
  }
  if (code && !useJunto.getState().code) joinRoom(code)
}
