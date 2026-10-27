import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from './index.js'

// /api/resumo ("Resumo ate aqui") e /api/sinopse (traducao): a IA so recebe o que veio do TMDB, e qualquer falha vira 204.
const ask = (path, env) => worker.fetch(new Request(`http://app${path}`, { headers: { 'cf-connecting-ip': String(Math.random()) } }), env, {})
const ai = (run) => ({ TMDB_TOKEN: 'a.b.c', AI: { run } })

function stubTmdb() {
  globalThis.fetch = async (url) => {
    url = String(url)
    if (url.includes('/search/')) return Response.json({ results: [{ id: 7 }] })
    if (url.includes('/tv/7/season/2')) return Response.json({ episodes: [{ episode_number: 1, overview: 'S2E1 ok' }, { episode_number: 2, overview: 'S2E2 SPOILER' }] })
    if (url.includes('/tv/7/season/1')) return Response.json({ episodes: [{ episode_number: 1, overview: 'S1E1 ok' }] })
    if (url.includes('/movie/7')) return Response.json({ overview: 'A man goes to space.' })
    throw new Error(`fetch inesperado: ${url}`)
  }
}

test('resumo: so os episodios antes do atual, em ordem, e nada do que vem depois', async () => {
  stubTmdb()
  let pedido
  const res = await ask('/api/resumo?title=Dark&season=2&episode=2', ai(async (m, input) => ((pedido = input.messages[1].content), { response: 'Antes disso...' })))
  assert.equal(res.status, 200)
  assert.equal((await res.json()).summary, 'Antes disso...')
  assert.match(pedido, /T1E1: S1E1 ok\nT2E1: S2E1 ok/)
  assert.doesNotMatch(pedido, /SPOILER/)
})

test('resumo: primeiro episodio, sem IA ou erro do modelo: 204', async () => {
  stubTmdb()
  assert.equal((await ask('/api/resumo?title=Dark&season=1&episode=1', ai(async () => assert.fail('nao devia chamar')))).status, 204)
  assert.equal((await ask('/api/resumo?title=Dark&season=2&episode=2', { TMDB_TOKEN: 'a.b.c' })).status, 204)
  assert.equal((await ask('/api/resumo?title=Dark&season=2&episode=2', ai(async () => { throw new Error('cota') }))).status, 204)
})

test('sinopse: traduz o texto em ingles do TMDB', async () => {
  stubTmdb()
  let pedido
  const res = await ask('/api/sinopse?title=Foo', ai(async (m, input) => ((pedido = input.messages[1].content), { response: 'Um homem vai ao espaço.' })))
  assert.equal((await res.json()).overview, 'Um homem vai ao espaço.')
  assert.equal(pedido, 'A man goes to space.')
  assert.equal((await ask('/api/sinopse?title=Foo', ai(async () => { throw new Error('cota') }))).status, 204)
})
