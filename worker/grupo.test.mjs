import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from './index.js'

// Codigo do grupo: com GROUP_CODE o proxy so atende quem ja mandou o codigo; sem ele nada muda.
const call = (path, env, { method = 'GET', body, cookie, token, ip = '7.7.7.7' } = {}) =>
  worker.fetch(
    new Request(`http://app${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(cookie ? { cookie } : {}), ...(token ? { 'x-grupo': token } : {}) },
      body: body && JSON.stringify(body),
    }),
    env,
  )
const interno = '/api/stream?url=' + encodeURIComponent('http://127.0.0.1/')

test('sem GROUP_CODE o proxy segue aberto', async () => {
  assert.deepEqual(await (await call('/api/grupo', {})).json(), { required: false, ok: true })
  assert.equal((await call(interno, {})).status, 403) // chegou no proxy (e foi barrado por ser rede interna)
})

test('com GROUP_CODE o proxy pede o codigo e o cookie libera', async () => {
  const env = { GROUP_CODE: 'Pedreira 2026' }
  assert.deepEqual(await (await call('/api/grupo', env)).json(), { required: true, ok: false })
  assert.equal((await call(interno, env)).status, 401)
  assert.equal((await call('/api/xtream?base=https://example.com', env)).status, 401)
  assert.equal((await call('/api/session', env, { method: 'POST', body: {} })).status, 401)

  assert.equal((await call('/api/grupo', env, { method: 'POST', body: { codigo: 'errado' }, ip: '7.7.7.8' })).status, 403)
  const ok = await call('/api/grupo', env, { method: 'POST', body: { codigo: ' pedreira 2026 ' }, ip: '7.7.7.8' })
  assert.equal(ok.status, 200)
  const { token } = await ok.clone().json()
  const setCookie = ok.headers.get('set-cookie')
  assert.match(setCookie, /HttpOnly/)
  assert.doesNotMatch(setCookie, /pedreira/i) // guarda o hash, nao o codigo
  const cookie = setCookie.split(';')[0]

  assert.deepEqual(await (await call('/api/grupo', env, { cookie })).json(), { required: true, ok: true })
  // Navegador que nao guarda o cookie (TV Samsung): o hash devolvido no corpo vale no header x-grupo.
  assert.deepEqual(await (await call('/api/grupo', env, { token })).json(), { required: true, ok: true })
  assert.deepEqual(await (await call('/api/grupo', env, { token: 'errado' })).json(), { required: true, ok: false })
  assert.equal((await call(interno, env, { cookie })).status, 403)
  // <img> sem cookie nem header (TV): o hash na URL (g) libera so as capas.
  assert.equal((await call(`${interno}&g=${token}`, env)).status, 403)
  assert.equal((await call(`${interno}&g=errado`, env)).status, 401)
  assert.equal((await call('/api/session', env, { method: 'POST', body: {}, cookie })).status, 400)
})

test('video com sessao cifrada passa sem cookie (Chromecast e AirPlay nao mandam cookie)', async () => {
  const res = await call('/api/stream?s=invalida&p=/x', { GROUP_CODE: 'abc' })
  assert.equal(await res.text(), 'invalid stream session')
})
