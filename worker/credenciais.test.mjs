import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from './index.js'

// O caminho de producao (Worker) de ponta a ponta: sessao cifrada, video, playlist HLS reescrita, catalogo
// com credenciais em cabecalho e o raw=1 da playlist M3U. Os e2e passam pelo server/index.js, nao por aqui.
const ENV = { STREAM_KEY: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))) }
const BASE = 'http://painel.exemplo:8080'

function stubFetch(handler) {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return handler(String(url))
  }
  return calls
}

async function newSid(env = ENV) {
  const res = await worker.fetch(
    new Request('http://app/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ base: BASE, username: 'usuario1', password: 'segredo9' }),
    }),
    env,
  )
  return res
}

test('sem o secret STREAM_KEY a sessao responde 204 (app segue no formato antigo)', async () => {
  assert.equal((await newSid({})).status, 204)
})

test('video pelo codigo cifrado chega ao provedor com as credenciais certas', async () => {
  const { sid } = await (await newSid()).json()
  assert.ok(!sid.includes('segredo9'))
  const calls = stubFetch(() => new Response('video', { status: 200, headers: { 'content-type': 'video/mp4' } }))
  const res = await worker.fetch(new Request(`http://app/api/stream?s=${sid}&p=${encodeURIComponent('/movie/~u/~p/7.mp4')}`), ENV)
  assert.equal(res.status, 200)
  assert.deepEqual(calls, [`${BASE}/movie/usuario1/segredo9/7.mp4`])
})

test('playlist HLS reescrita nao devolve a senha nas URLs dos segmentos', async () => {
  const { sid } = await (await newSid()).json()
  stubFetch(() =>
    new Response(`#EXTM3U\n#EXTINF:6,\n${BASE}/live/usuario1/segredo9/101_1.ts\n#EXTINF:6,\nhttp://cdn.exemplo/hls/tok/2.ts\n`, {
      status: 200,
      headers: { 'content-type': 'application/vnd.apple.mpegurl' },
    }),
  )
  const res = await worker.fetch(new Request(`http://app/api/stream?s=${sid}&p=${encodeURIComponent('/live/~u/~p/101.m3u8')}`), ENV)
  const text = await res.text()
  assert.ok(!text.includes('segredo9'), text)
  assert.ok(text.includes(`/api/stream?s=${sid}&p=`))
  assert.ok(text.includes(encodeURIComponent('http://cdn.exemplo/hls/tok/2.ts')))
})

test('codigo invalido e recusado com 401, sem chamar o provedor', async () => {
  const calls = stubFetch(() => new Response('x'))
  const res = await worker.fetch(new Request(`http://app/api/stream?s=invalido&p=${encodeURIComponent('/movie/~u/~p/1.mp4')}`), ENV)
  assert.equal(res.status, 401)
  assert.equal(calls.length, 0)
})

test('catalogo: usuario e senha vem dos cabecalhos, nao da URL', async () => {
  const calls = stubFetch(() => Response.json({ ok: true }))
  const res = await worker.fetch(
    new Request(`http://app/api/xtream?base=${encodeURIComponent(BASE)}&path=player_api.php&action=get_vod_categories`, {
      headers: { 'x-xtream-username': 'usuario1', 'x-xtream-password': 'segredo9' },
    }),
    ENV,
  )
  assert.equal(res.status, 200)
  const sent = new URL(calls[0])
  assert.equal(sent.searchParams.get('username'), 'usuario1')
  assert.equal(sent.searchParams.get('password'), 'segredo9')
  assert.equal(sent.searchParams.get('action'), 'get_vod_categories')
})

test('raw=1 (playlist M3U para virar catalogo) chega intacta, sem reescrita', async () => {
  const m3u = '#EXTM3U\n#EXTINF:-1,Canal\nhttp://iptv.exemplo/1.m3u8\n'
  stubFetch(() => new Response(m3u, { status: 200, headers: { 'content-type': 'audio/x-mpegurl' } }))
  const res = await worker.fetch(new Request(`http://app/api/stream?raw=1&url=${encodeURIComponent('http://iptv.exemplo/lista.m3u')}`), ENV)
  assert.equal(await res.text(), m3u)
})

test('usuario e senha na query sao descartados: o provedor so recebe o que veio nos cabecalhos', async () => {
  const calls = stubFetch(() => Response.json({ ok: true }))
  await worker.fetch(
    new Request(`http://app/api/xtream?base=${encodeURIComponent(BASE)}&username=intruso&password=vazada`, {
      headers: { 'x-xtream-username': 'usuario1', 'x-xtream-password': 'segredo9' },
    }),
    ENV,
  )
  const sent = new URL(calls[0])
  assert.equal(sent.searchParams.get('username'), 'usuario1')
  assert.equal(sent.searchParams.get('password'), 'segredo9')
  // Sem cabecalho, a query nao vale como credencial.
  const semCabecalho = stubFetch(() => Response.json({ ok: true }))
  await worker.fetch(new Request(`http://app/api/xtream?base=${encodeURIComponent(BASE)}&username=intruso&password=vazada`), ENV)
  assert.equal(new URL(semCabecalho[0]).searchParams.get('username'), null)
})
