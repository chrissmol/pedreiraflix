import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from '../../worker/index.js'

// D1 de mentira com o que o pareamento usa (INSERT/DELETE/SELECT/UPDATE na tabela `pareamento`).
function fakeD1() {
  const rows = new Map()
  return {
    rows,
    prepare: (sql) => {
      const stmt = (args) => ({
        run: async () => {
          if (/^INSERT/.test(sql)) {
            const [id, code, pub, expires] = args
            if ([...rows.values()].some((r) => r.code === code)) throw new Error('UNIQUE')
            rows.set(id, { id, code, pub, expires, payload: null })
          } else if (/^DELETE FROM pareamento WHERE expires/.test(sql)) {
            for (const [id, r] of rows) if (r.expires <= args[0]) rows.delete(id)
          } else if (/^UPDATE/.test(sql)) {
            const [payload, code, now] = args
            const r = [...rows.values()].find((x) => x.code === code && x.expires > now && x.payload === null)
            if (r) r.payload = payload
            return { meta: { changes: r ? 1 : 0 } }
          }
          return { meta: { changes: 0 } }
        },
        first: async () => {
          if (/^DELETE/.test(sql)) {
            const [id, now] = args
            const r = rows.get(id)
            if (!r || r.expires <= now || r.payload === null) return null
            rows.delete(id)
            return { payload: r.payload }
          }
          if (/FROM pareamento WHERE code/.test(sql)) {
            const r = [...rows.values()].find((x) => x.code === args[0] && x.expires > args[1])
            return r ? { pub: r.pub } : null
          }
          const r = rows.get(args[0])
          return r && r.expires > args[1] ? { ok: 1 } : null
        },
      })
      return { ...stmt([]), bind: (...args) => stmt(args) }
    },
  }
}

const PUB = 'B'.repeat(87)
let n = 0
const call = (env, method, path, body, { cookie, ip } = {}) =>
  worker.fetch(
    new Request(`http://app${path}`, {
      method,
      headers: { 'cf-connecting-ip': ip ?? `7.7.${++n >> 8}.${n & 255}`, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  )
const novo = async (env) => (await call(env, 'POST', '/api/parear', { pub: PUB })).json()

test('fluxo completo: TV cria, celular confirma, TV recebe uma unica vez e a linha some', async () => {
  const env = { SYNC: fakeD1() }
  const { userCode, deviceCode, expiresIn } = await novo(env)
  assert.match(userCode, /^[BCDFGHJKLMNPQRSTVWXZ]{8}$/)
  assert.equal(expiresIn, 300)
  assert.equal((await call(env, 'POST', '/api/parear/token', { deviceCode })).status, 202)

  const found = await call(env, 'GET', `/api/parear?code=${userCode.slice(0, 4)}-${userCode.slice(4).toLowerCase()}`)
  assert.deepEqual(await found.json(), { pub: PUB })

  const sent = { code: userCode, pub: 'C'.repeat(87), iv: 'a'.repeat(16), ct: 'segredo_cifrado' }
  assert.equal((await call(env, 'POST', '/api/parear/confirm', sent)).status, 204)
  assert.equal((await call(env, 'POST', '/api/parear/confirm', sent)).status, 404, 'segunda confirmacao nao sobrescreve')

  const got = await call(env, 'POST', '/api/parear/token', { deviceCode })
  assert.deepEqual(await got.json(), { pub: sent.pub, iv: sent.iv, ct: sent.ct })
  assert.equal((await call(env, 'POST', '/api/parear/token', { deviceCode })).status, 410, 'uso unico')
  assert.equal(env.SYNC.rows.size, 0)
})

test('o servidor guarda so o hash do device_code e nunca texto da conta', async () => {
  const env = { SYNC: fakeD1() }
  const { deviceCode } = await novo(env)
  assert.ok(![...env.SYNC.rows.keys()].includes(deviceCode))
})

test('expira: depois de 5 minutos nem a TV recebe nem o celular acha o codigo', async () => {
  const env = { SYNC: fakeD1() }
  const { userCode, deviceCode } = await novo(env)
  for (const r of env.SYNC.rows.values()) r.expires = Date.now() - 1
  assert.equal((await call(env, 'POST', '/api/parear/token', { deviceCode })).status, 410)
  assert.equal((await call(env, 'GET', `/api/parear?code=${userCode}`)).status, 404)
  assert.equal((await call(env, 'POST', '/api/parear/confirm', { code: userCode, pub: PUB, iv: 'a'.repeat(16), ct: 'x' })).status, 404)
})

test('rejeita pedidos fora do formato', async () => {
  const env = { SYNC: fakeD1() }
  assert.equal((await call(env, 'POST', '/api/parear', { pub: 'curta' })).status, 400)
  assert.equal((await call(env, 'POST', '/api/parear/token', { deviceCode: 'x' })).status, 400)
  assert.equal((await call(env, 'GET', '/api/parear?code=AAAA')).status, 404)
  assert.equal((await call(env, 'POST', '/api/parear/confirm', { code: 'BBBBBBBB', pub: PUB, iv: 'a'.repeat(16), ct: 'a b' })).status, 400)
  assert.equal((await call(env, 'POST', '/api/parear/confirm', { code: 'BBBBBBBB', pub: PUB, iv: 'a'.repeat(16), ct: 'a'.repeat(9000) })).status, 400)
})

test('limita tentativas de achar codigo por IP', async () => {
  const env = { SYNC: fakeD1() }
  const codes = []
  for (let i = 0; i < 17; i++) codes.push((await call(env, 'GET', '/api/parear?code=BBBBBBBB', undefined, { ip: '5.5.5.5' })).status)
  assert.equal(codes[0], 404)
  assert.equal(codes.at(-1), 429)
})

test('com GROUP_CODE o celular precisa estar no grupo; a TV nao', async () => {
  const env = { SYNC: fakeD1(), GROUP_CODE: 'pedreira' }
  const { userCode, deviceCode } = await novo(env)
  assert.equal((await call(env, 'POST', '/api/parear/token', { deviceCode })).status, 202)
  assert.equal((await call(env, 'GET', `/api/parear?code=${userCode}`)).status, 401)
  const body = { code: userCode, pub: PUB, iv: 'a'.repeat(16), ct: 'x' }
  assert.equal((await call(env, 'POST', '/api/parear/confirm', body)).status, 401)
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pedreiraflix-grupo:pedreira'))).toString('hex')
  assert.equal((await call(env, 'POST', '/api/parear/confirm', body, { cookie: `pf_grupo=${hash}` })).status, 204)
})
