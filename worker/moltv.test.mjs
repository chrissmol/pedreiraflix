import assert from 'node:assert/strict'
import { test } from 'node:test'
import { molTv, molTvTarget } from './moltv.js'

const target = (path) => molTvTarget(new URL(`https://x${path}`))

test('so libera busca e proximos jogos do time', () => {
  assert.equal(target('/api/moltv/v1/search?q=flamengo'), '/v1/search?q=flamengo')
  assert.equal(target('/api/moltv/v1/teams/sao-paulo/next'), '/v1/teams/sao-paulo/next')
  assert.equal(target('/api/moltv/v1/search?q='), null)
  assert.equal(target('/api/moltv/v1/teams/../admin/next'), null)
  assert.equal(target('/api/moltv/admin/ingest'), null)
  assert.equal(target('/api/moltv/v1/teams/Flamengo/next'), null)
})

test('usa o service binding quando existe e responde 502 se o Mol TV cair', async () => {
  let called
  const env = { MOLTV: { fetch: async (u) => ((called = u), Response.json({ ok: 1 })) } }
  const res = await molTv(new URL('https://x/api/moltv/v1/teams/flamengo/next'), env)
  assert.equal(res.status, 200)
  assert.equal(called, 'https://mol-tv-api.chrisouzamol.workers.dev/v1/teams/flamengo/next')
  const down = await molTv(new URL('https://x/api/moltv/v1/search?q=a'), { MOLTV: { fetch: async () => { throw new Error('x') } } })
  assert.equal(down.status, 502)
  assert.equal((await molTv(new URL('https://x/api/moltv/nope'), env)).status, 404)
})
