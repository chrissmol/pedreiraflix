import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from './index.js'

// D1 de mentira: so o que /api/sync usa.
function fakeD1() {
  const rows = new Map()
  return {
    rows,
    prepare: (sql) => ({
      bind: (...args) => ({
        first: async () => (rows.has(args[0]) ? { data: rows.get(args[0]) } : null),
        run: async () => rows.set(args[0], args[1]),
      }),
      run: async () => assert.match(sql, /CREATE TABLE/),
    }),
  }
}
const key = 'a'.repeat(64)
const call = (method, env, { k = key, body, ip = '9.9.9.9' } = {}) =>
  worker.fetch(new Request('http://app/api/sync', { method, headers: { 'x-sync-key': k, 'cf-connecting-ip': ip }, body }), env)

test('sync guarda e devolve o mesmo json pela chave', async () => {
  const env = { SYNC: fakeD1() }
  assert.equal(await (await call('GET', env)).text(), '{}')
  assert.equal((await call('PUT', env, { body: '{"ana":{"watched":["movie-1"]}}' })).status, 204)
  assert.deepEqual(await (await call('GET', env)).json(), { ana: { watched: ['movie-1'] } })
})

test('sync recusa chave fora do formato e corpo que nao e objeto', async () => {
  const env = { SYNC: fakeD1() }
  assert.equal((await call('GET', env, { k: 'abc', ip: '8.8.8.8' })).status, 400)
  assert.equal((await call('PUT', env, { body: '[1]', ip: '8.8.8.8' })).status, 400)
  assert.equal(env.SYNC.rows.size, 0)
})
