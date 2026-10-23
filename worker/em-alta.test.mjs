import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from './index.js'

const ask = (kind, env) => worker.fetch(new Request(`http://app/api/em-alta?kind=${kind}`, { headers: { 'cf-connecting-ip': String(Math.random()) } }), env)

test('em alta: junta as duas paginas do TMDB, nome em portugues e original, sem repetir', async () => {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return String(url).includes('page=1')
      ? Response.json({ results: [{ title: 'Duna: Parte Dois', original_title: 'Dune: Part Two' }, { title: 'Divertida Mente 2', original_title: 'Inside Out 2' }] })
      : Response.json({ results: [{ title: 'Interestelar', original_title: 'Interestelar' }] })
  }
  const body = await (await ask('movie', { TMDB_TOKEN: 'a.b.c' })).json()
  assert.deepEqual(body.titles, ['Duna: Parte Dois', 'Dune: Part Two', 'Divertida Mente 2', 'Inside Out 2', 'Interestelar'])
  assert.ok(calls.every((u) => u.includes('/trending/movie/week')))
})

test('em alta: series usam name e /trending/tv; sem token ou com erro, 204', async () => {
  globalThis.fetch = async (url) => Response.json({ results: String(url).includes('/trending/tv/') ? [{ name: 'Round 6', original_name: '오징어 게임' }] : [] })
  assert.deepEqual((await (await ask('tv', { TMDB_TOKEN: 'a.b.c' })).json()).titles, ['Round 6', '오징어 게임'])
  assert.equal((await ask('movie', {})).status, 204)
  globalThis.fetch = async () => new Response('x', { status: 401 })
  assert.equal((await ask('movie', { TMDB_TOKEN: 'a.b.c' })).status, 204)
})
