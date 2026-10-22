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

test('series (kind=tv): busca em /search/tv e pega o codigo IMDb dos external_ids', async () => {
  const calls = []
  globalThis.fetch = async (url) => {
    url = String(url)
    calls.push(url)
    if (url.includes('/search/tv')) return Response.json({ results: [{ id: 1396 }] })
    if (url.includes('/tv/1396')) return Response.json({ genres: [{ name: 'Drama' }], first_air_date: '2008-01-20', vote_average: 8.9, overview: 'Serie.', external_ids: { imdb_id: 'tt0903747' } })
    if (url.includes('omdbapi.com')) return Response.json({ imdbRating: '9.5' })
    throw new Error(`fetch inesperado: ${url}`)
  }
  const res = await worker.fetch(new Request('http://app/api/tmdb?title=Breaking+Bad&year=2008&kind=tv', { headers: { 'cf-connecting-ip': String(Math.random()) } }), ENV)
  const body = await res.json()
  assert.equal(body.imdbRating, '9.5')
  assert.equal(body.year, '2008')
  assert.ok(calls.some((u) => u.includes('/search/tv') && u.includes('first_air_date_year=2008')))
  assert.ok(calls.some((u) => u.includes('append_to_response=external_ids')))
  assert.ok(calls.some((u) => u.includes('i=tt0903747')))
})

test('series: elenco e miniaturas de episodio do TVmaze pelo codigo IMDb; TVmaze fora do ar nao quebra', async () => {
  const tvmazeUp = async (url) => {
    if (url.includes('/lookup/shows?imdb=tt0903747')) return Response.json({ id: 169 })
    if (url.includes('/shows/169?')) return Response.json({ _embedded: {
      episodes: [{ season: 1, number: 1, image: { medium: 'https://static.tvmaze.com/e1.jpg' } }, { season: 1, number: 2, image: null }],
      cast: [{ person: { name: 'Bryan Cranston' } }, { person: { name: 'Aaron Paul' } }],
    } })
    throw new Error('rede')
  }
  for (const [tvmaze, expected] of [
    [tvmazeUp, { cast: 'Bryan Cranston, Aaron Paul', episodeImages: { '1x1': 'https://static.tvmaze.com/e1.jpg' } }],
    [async () => { throw new Error('rede') }, null],
  ]) {
    globalThis.fetch = async (url) => {
      url = String(url)
      if (url.includes('/search/tv')) return Response.json({ results: [{ id: 1396 }] })
      if (url.includes('/tv/1396')) return Response.json({ genres: [], first_air_date: '2008-01-20', external_ids: { imdb_id: 'tt0903747' } })
      if (url.includes('tvmaze.com')) return tvmaze(url)
      throw new Error(`fetch inesperado: ${url}`)
    }
    const res = await worker.fetch(new Request('http://app/api/tmdb?title=Breaking+Bad&kind=tv', { headers: { 'cf-connecting-ip': String(Math.random()) } }), ENV)
    assert.equal(res.status, 200)
    assert.deepEqual((await res.json()).tvmaze, expected)
  }
})

// O Retry-After do provedor no 429 tem que chegar no app (ele para de pedir pelo tempo certo) — Worker de verdade.
test('429 do provedor: /api/xtream repassa o Retry-After', async () => {
  globalThis.fetch = async () => new Response('', { status: 429, headers: { 'content-type': 'text/html', 'retry-after': '7' } })
  const res = await worker.fetch(
    new Request('http://app/api/xtream?base=http%3A%2F%2Fpainel.exemplo%3A8080&path=player_api.php&action=get_live_streams', {
      headers: { 'x-xtream-username': 'u', 'x-xtream-password': 'p', 'cf-connecting-ip': String(Math.random()) },
    }),
    ENV,
  )
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('retry-after'), '7')
})
