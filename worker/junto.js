// "Assistir junto": uma sala por codigo (Durable Object, plano gratis da Cloudflare). Cada aparelho da sala abre um
// WebSocket em /api/junto/<codigo>; quem da play, pausa, avanca ou troca de titulo manda o estado, e a sala repassa aos
// outros. A sala guarda o ultimo estado para quem chega depois. Nao ve login nem video: so o caminho da tela e a posicao.
// Titulo novo: ninguem toca ate todos avisarem "pronto" (ou passar ESPERA_MS); so entao quem abriu da o play e a sala o segue.
// Quem sai do player avisa e a sala fecha o titulo para todos. Usa a API de hibernacao (acceptWebSocket): parado entre uma mensagem e outra, o objeto nao gasta nada.

export const CODE_RE = /^[A-Z0-9]{6}$/
const MAX_PESSOAS = 8
const MAX_MSG = 2048
// Quanto a sala espera todo mundo carregar o titulo novo antes de mandar tocar (alguem que saiu ou travou nao trava a sala).
const ESPERA_MS = 20_000

const sameTitle = (a, b) => (a.ref && b.ref ? a.ref.k === b.ref.k && a.ref.t === b.ref.t && a.ref.s === b.ref.s && a.ref.e === b.ref.e : a.path === b.path)

/** So o que a sala precisa, com tipos conferidos: o resto do que o aparelho mandar e descartado. */
export function cleanState(raw) {
  if (!raw || typeof raw !== 'object') return null
  const { path, playing, pos, ref } = raw
  if (typeof path !== 'string' || !path.startsWith('/watch/') || path.length > 600) return null
  if (typeof playing !== 'boolean' || typeof pos !== 'number' || !Number.isFinite(pos) || pos < 0) return null
  const out = { path, playing, pos }
  if (ref && typeof ref === 'object' && ['movie', 'series', 'live'].includes(ref.k) && typeof ref.t === 'string' && ref.t && ref.t.length <= 200) {
    out.ref = { k: ref.k, t: ref.t }
    for (const n of ['s', 'e']) if (Number.isFinite(ref[n])) out.ref[n] = ref[n]
  }
  return out
}

export class SalaJunto {
  constructor(ctx) {
    this.ctx = ctx
    this.esperaMs = ESPERA_MS
  }

  att(ws) {
    return ws.deserializeAttachment() ?? { ready: 0, opener: false }
  }

  /** Todos (menos `saindo`) ja avisaram "pronto" para a espera `id`? */
  todosProntos(id, saindo) {
    return this.ctx.getWebSockets().every((w) => w === saindo || this.att(w).ready === id)
  }

  async fim(id) {
    await this.ctx.storage.delete('espera')
    await this.ctx.storage.deleteAlarm()
    for (const w of this.ctx.getWebSockets()) {
      try {
        w.send(JSON.stringify({ t: 'comecar', id, toca: this.att(w).opener }))
      } catch {
        // ja fechou
      }
    }
  }

  async alarm() {
    const espera = await this.ctx.storage.get('espera')
    if (espera) await this.fim(espera.id)
  }

  async fetch(request) {
    if (request.headers.get('upgrade') !== 'websocket') return new Response('websocket only', { status: 426 })
    if (this.ctx.getWebSockets().length >= MAX_PESSOAS) return new Response('sala cheia', { status: 409 })
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ ready: 0, opener: false })
    const last = await this.ctx.storage.get('estado')
    if (last) server.send(JSON.stringify({ t: 'estado', ...last.state, age: Date.now() - last.at }))
    // Quem entra no meio de uma espera tambem e esperado.
    const espera = await this.ctx.storage.get('espera')
    if (espera) server.send(JSON.stringify({ t: 'espera', id: espera.id }))
    this.pessoas()
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_MSG) return
    let msg
    try {
      msg = JSON.parse(message)
    } catch {
      return
    }
    if (msg?.t === 'pronto') {
      const espera = await this.ctx.storage.get('espera')
      if (!espera || msg.id !== espera.id) return
      ws.serializeAttachment({ ...this.att(ws), ready: espera.id })
      if (this.todosProntos(espera.id)) await this.fim(espera.id)
      return
    }
    if (msg?.t === 'sair') {
      if (!(await this.ctx.storage.get('estado'))) return
      await this.ctx.storage.delete('estado')
      await this.ctx.storage.delete('espera')
      await this.ctx.storage.deleteAlarm()
      for (const other of this.ctx.getWebSockets()) if (other !== ws) other.send('{"t":"sair"}')
      return
    }
    if (msg?.t !== 'estado') return
    const state = cleanState(msg)
    if (!state) return
    const last = await this.ctx.storage.get('estado')
    const nova = !last || !sameTitle(last.state, state)
    // Titulo novo nasce pausado para todos; o play volta so quando a espera acaba.
    if (nova) state.playing = false
    // Repassa primeiro: guardar em disco nao pode atrasar a pausa de ninguem.
    const out = JSON.stringify({ t: 'estado', ...state, age: 0 })
    for (const other of this.ctx.getWebSockets()) if (other !== ws) other.send(out)
    await this.ctx.storage.put('estado', { state, at: Date.now() })
    if (!nova) return
    const id = 1 + Math.floor(Math.random() * 2 ** 31)
    for (const w of this.ctx.getWebSockets()) w.serializeAttachment({ ready: 0, opener: w === ws })
    await this.ctx.storage.put('espera', { id })
    await this.ctx.storage.setAlarm(Date.now() + this.esperaMs)
    const aviso = JSON.stringify({ t: 'espera', id })
    for (const w of this.ctx.getWebSockets()) w.send(aviso)
  }

  async webSocketClose(ws) {
    try {
      ws.close()
    } catch {
      // ja fechou
    }
    await this.saiu(ws)
  }

  async webSocketError(ws) {
    await this.saiu(ws)
  }

  /** Quem sai nao segura a espera dos outros. */
  async saiu(ws) {
    this.pessoas(ws)
    const espera = await this.ctx.storage.get('espera')
    if (espera && this.ctx.getWebSockets().some((w) => w !== ws) && this.todosProntos(espera.id, ws)) await this.fim(espera.id)
  }

  /** Quantas pessoas estao na sala, para todo mundo. */
  pessoas(saindo) {
    const all = this.ctx.getWebSockets().filter((w) => w !== saindo)
    const out = JSON.stringify({ t: 'pessoas', n: all.length })
    for (const w of all) {
      try {
        w.send(out)
      } catch {
        // ja fechou
      }
    }
  }
}

/** /api/junto/<codigo>: entrega o WebSocket para a sala daquele codigo. */
export async function junto(request, url, env) {
  const code = url.pathname.slice('/api/junto/'.length)
  if (!CODE_RE.test(code)) return new Response('codigo invalido', { status: 400 })
  if (!env.JUNTO) return new Response('salas nao configuradas', { status: 503 })
  return env.JUNTO.get(env.JUNTO.idFromName(code)).fetch(request)
}
