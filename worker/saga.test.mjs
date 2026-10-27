import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from './index.js'

const ask = (qs, env) => worker.fetch(new Request(`http://app/api/saga?${qs}`, { headers: { 'cf-connecting-ip': String(Math.random()) } }), env)

test('saga: colecao do filme em ordem de lancamento, sem os ainda sem data', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('/search/movie')) return Response.json({ results: [{ id: 9 }] })
    if (u.includes('/movie/9')) return Response.json({ belongs_to_collection: { id: 77, name: 'Velozes e Furiosos: A Coleção' } })
    if (u.includes('/collection/77'))
      return Response.json({
        parts: [
          { title: 'Velozes e Furiosos 5', original_title: 'Fast Five', release_date: '2011-04-20' },
          { title: 'Velozes e Furiosos', original_title: 'The Fast and the Furious', release_date: '2001-06-18' },
          { title: 'Velozes 12', original_title: 'Fast 12', release_date: '' },
        ],
      })
    return new Response('x', { status: 404 })
  }
  const body = await (await ask('title=Velozes%20e%20Furiosos%205&year=2011', { TMDB_TOKEN: 'a.b.c' })).json()
  assert.equal(body.name, 'Velozes e Furiosos: A Coleção')
  assert.deepEqual(body.parts.map((p) => p.original), ['The Fast and the Furious', 'Fast Five'])
})

test('saga: filme sem colecao, sem token ou sem titulo: 204', async () => {
  globalThis.fetch = async (url) => Response.json(String(url).includes('/search/') ? { results: [{ id: 1 }] } : { belongs_to_collection: null })
  assert.equal((await ask('title=Solo', { TMDB_TOKEN: 'a.b.c' })).status, 204)
  assert.equal((await ask('title=Solo', {})).status, 204)
  assert.equal((await ask('title=', { TMDB_TOKEN: 'a.b.c' })).status, 204)
})
