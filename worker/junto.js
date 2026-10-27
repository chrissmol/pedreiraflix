// "Assistir junto": uma sala por codigo (Durable Object, plano gratis da Cloudflare). Cada aparelho da sala abre um
// WebSocket em /api/junto/<codigo>; quem da play, pausa, avanca ou troca de titulo manda o estado, e a sala repassa aos
// outros. A sala guarda o ultimo estado para quem chega depois. Nao ve login nem video: so o caminho da tela e a posicao.
// Usa a API de hibernacao (acceptWebSocket): parado entre uma mensagem e outra, o objeto nao gasta nada.

export const CODE_RE = /^[A-Z0-9]{6}$/
const MAX_PESSOAS = 8
const MAX_MSG = 2048

/** So o que a sala precisa, com tipos conferidos: o resto do que o aparelho mandar e descartado. */
export function cleanState(raw) {
  if (!raw || typeof raw !== 'object') return null
  const { path, playing, pos } = raw
  if (typeof path !== 'string' || !path.startsWith('/watch/') || path.length > 600) return null
  if (typeof playing !== 'boolean' || typeof pos !== 'number' || !Number.isFinite(pos) || pos < 0) return null
  return { path, playing, pos }
}

export class SalaJunto {
  constructor(ctx) {
    this.ctx = ctx
  }

  async fetch(request) {
    if (request.headers.get('upgrade') !== 'websocket') return new Response('websocket only', { status: 426 })
    if (this.ctx.getWebSockets().length >= MAX_PESSOAS) return new Response('sala cheia', { status: 409 })
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    const last = await this.ctx.storage.get('estado')
    if (last) server.send(JSON.stringify({ t: 'estado', ...last.state, age: Date.now() - last.at }))
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
    if (msg?.t !== 'estado') return
    const state = cleanState(msg)
    if (!state) return
    await this.ctx.storage.put('estado', { state, at: Date.now() })
    const out = JSON.stringify({ t: 'estado', ...state, age: 0 })
    for (const other of this.ctx.getWebSockets()) if (other !== ws) other.send(out)
  }

  async webSocketClose(ws) {
    try {
      ws.close()
    } catch {
      // ja fechou
    }
    this.pessoas(ws)
  }

  async webSocketError(ws) {
    this.pessoas(ws)
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
