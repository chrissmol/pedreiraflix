import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from './index.js'

const ask = (q, env) => worker.fetch(new Request(`http://app/api/generos?${q}`, { headers: { 'cf-connecting-ip': String(Math.random()) } }), env)

test('generos: junta as paginas do discover do TMDB num so lista de ids', async () => {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    const page = Number(new URL(String(url)).searchParams.get('page'))
    return Response.json({ results: [{ id: page * 10 }, { id: page * 10 + 1 }] })
  }
  const body = await (await ask('genre=28', { TMDB_TOKEN: 'a.b.c' })).json()
  assert.equal(body.ids.length, 16)
  assert.ok(calls.every((u) => u.includes('/discover/movie') && u.includes('with_genres=28')))
})

test('generos: genero invalido, sem token ou erro do TMDB respondem 204', async () => {
  assert.equal((await ask('genre=abc', { TMDB_TOKEN: 'a.b.c' })).status, 204)
  assert.equal((await ask('genre=28', {})).status, 204)
  globalThis.fetch = async () => new Response('x', { status: 401 })
  assert.equal((await ask('genre=27', { TMDB_TOKEN: 'a.b.c' })).status, 204)
})

test('streaming: discover com a plataforma e regiao BR; invalido ou sem token responde 204', async () => {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return Response.json({ results: [{ id: 7 }] })
  }
  const ask2 = (q, env) => worker.fetch(new Request(`http://app/api/streaming?${q}`, { headers: { 'cf-connecting-ip': String(Math.random()) } }), env)
  const body = await (await ask2('provider=8&kind=tv', { TMDB_TOKEN: 'a.b.c' })).json()
  assert.equal(body.ids.length, 10)
  assert.ok(calls.every((u) => u.includes('/discover/tv') && u.includes('with_watch_providers=8') && u.includes('watch_region=BR')))
  assert.equal((await ask2('provider=x', { TMDB_TOKEN: 'a.b.c' })).status, 204)
  assert.equal((await ask2('provider=8', {})).status, 204)
})
