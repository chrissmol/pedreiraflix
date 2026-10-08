import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from './index.js'

// /api/tmdb com a nota do IMDb (via OMDb, pelo codigo IMDb que o TMDB devolve). Opcional como o TMDB: sem
// OMDB_KEY ou com qualquer falha do OMDb, a resposta sai igual a de antes, so sem a nota.
function stubFetch(omdb) {
  const calls = []
  globalThis.fetch = async (url) => {
    url = String(url)
    calls.push(url)
    if (url.includes('/search/movie')) return Response.json({ results: [{ id: 157336 }] })
    if (url.includes('/movie/157336')) return Response.json({ genres: [{ name: 'Aventura' }], release_date: '2014-11-06', vote_average: 8.4, overview: 'Sinopse.', imdb_id: 'tt0816692' })
    if (url.includes('omdbapi.com')) return omdb(url)
    throw new Error(`fetch inesperado: ${url}`)
  }
  return calls
}
const ask = (env) => worker.fetch(new Request('http://app/api/tmdb?title=Interestelar&year=2014', { headers: { 'cf-connecting-ip': String(Math.random()) } }), env)
const ENV = { TMDB_TOKEN: 'a.b.c', OMDB_KEY: 'chave' }

test('com OMDB_KEY, devolve a nota do IMDb pelo codigo do TMDB', async () => {
  const calls = stubFetch(() => Response.json({ imdbRating: '8.7' }))
  const body = await (await ask(ENV)).json()
  assert.equal(body.imdbRating, '8.7')
  assert.equal(body.rating, 8.4)
  assert.ok(calls.some((u) => u.includes('i=tt0816692')))
})

test('sem OMDB_KEY nao chama o OMDb e a nota vem nula', async () => {
  const calls = stubFetch(() => assert.fail('nao devia chamar o OMDb'))
  const body = await (await ask({ TMDB_TOKEN: 'a.b.c' })).json()
  assert.equal(body.imdbRating, null)
  assert.equal(body.overview, 'Sinopse.')
  assert.ok(!calls.some((u) => u.includes('omdbapi.com')))
})

test('OMDb sem nota (N/A), com erro ou fora do ar: pagina segue com os dados do TMDB', async () => {
  for (const omdb of [() => Response.json({ imdbRating: 'N/A' }), () => new Response('x', { status: 401 }), () => { throw new Error('rede') }]) {
    stubFetch(omdb)
    const res = await ask(ENV)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.imdbRating, null)
    assert.deepEqual(body.genres, ['Aventura'])
  }
})
