import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker, { SalaJunto } from './index.js'
import { cleanState } from './junto.js'

class FakeSocket {
  sent = []
  send(m) {
    this.sent.push(JSON.parse(m))
  }
  close() {}
}
function fakeCtx() {
  const sockets = []
  const store = new Map()
  return {
    sockets,
    acceptWebSocket: (ws) => sockets.push(ws),
    getWebSockets: () => sockets,
    storage: { get: async (k) => store.get(k), put: async (k, v) => store.set(k, v) },
  }
}
// Sem o runtime da Cloudflare: o par de sockets vira dois objetos falsos.
globalThis.WebSocketPair = class {
  constructor() {
    this[0] = new FakeSocket()
    this[1] = new FakeSocket()
  }
}
const OriginalResponse = Response
globalThis.Response = class extends OriginalResponse {
  constructor(body, init) {
    super(body, init?.status === 101 ? { ...init, status: 200 } : init)
    if (init?.status === 101) Object.defineProperty(this, 'status', { value: 101 })
  }
}
const upgrade = () => new Request('http://app/api/junto/ABC123', { headers: { upgrade: 'websocket' } })

test('sala: repassa o estado para os outros, guarda para quem chega depois e conta as pessoas', async () => {
  const ctx = fakeCtx()
  const sala = new SalaJunto(ctx)
  assert.equal((await sala.fetch(upgrade())).status, 101)
  assert.equal((await sala.fetch(upgrade())).status, 101)
  const [a, b] = ctx.sockets
  assert.deepEqual(b.sent.at(-1), { t: 'pessoas', n: 2 })
  await sala.webSocketMessage(a, JSON.stringify({ t: 'estado', path: '/watch/movie/1?ext=mp4', playing: true, pos: 42, extra: 'x' }))
  assert.equal(a.sent.filter((m) => m.t === 'estado').length, 0)
  assert.deepEqual(b.sent.at(-1), { t: 'estado', path: '/watch/movie/1?ext=mp4', playing: true, pos: 42, age: 0 })
  await sala.fetch(upgrade())
  const c = ctx.sockets[2]
  assert.equal(c.sent[0].t, 'estado')
  assert.equal(c.sent[0].pos, 42)
  assert.ok(c.sent[0].age >= 0)
  await sala.webSocketClose(b)
  ctx.sockets.splice(1, 1)
  assert.deepEqual(a.sent.at(-1), { t: 'pessoas', n: 2 })
})

test('sala: ignora estado invalido e caminho fora do player', async () => {
  const ctx = fakeCtx()
  const sala = new SalaJunto(ctx)
  await sala.fetch(upgrade())
  await sala.fetch(upgrade())
  const [a, b] = ctx.sockets
  const before = b.sent.length
  for (const bad of ['nao json', JSON.stringify({ t: 'estado', path: 'https://mal.com', playing: true, pos: 1 }), JSON.stringify({ t: 'estado', path: '/watch/x', playing: 'sim', pos: 1 })])
    await sala.webSocketMessage(a, bad)
  assert.equal(b.sent.length, before)
  assert.equal(cleanState({ path: '/watch/live/1', playing: false, pos: -1 }), null)
})

test('/api/junto: codigo invalido e 400; sem o binding, 503; sala cheia, 409', async () => {
  const ask = (code, env) => worker.fetch(new Request(`http://app/api/junto/${code}`, { headers: { upgrade: 'websocket', 'cf-connecting-ip': String(Math.random()) } }), env)
  assert.equal((await ask('abc', {})).status, 400)
  assert.equal((await ask('ABC123', {})).status, 503)
  const ctx = fakeCtx()
  for (let i = 0; i < 8; i++) ctx.sockets.push(new FakeSocket())
  assert.equal((await new SalaJunto(ctx).fetch(upgrade())).status, 409)
})
