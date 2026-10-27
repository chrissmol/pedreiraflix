import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from './index.js'

const ask = (q, env) => worker.fetch(new Request(`http://app/api/pessoa?q=${encodeURIComponent(q)}`, { headers: { 'cf-connecting-ip': String(Math.random()) } }), env)
const env = { TMDB_TOKEN: 'a.b.c' }

test('pessoa: ator devolve os filmes e series em que atuou, mais populares primeiro, nome em portugues e original', async () => {
  globalThis.fetch = async (url) =>
    String(url).includes('/search/person')
      ? Response.json({ results: [{ id: 31, name: 'Tom Hanks', known_for_department: 'Acting' }] })
      : Response.json({
          cast: [
            { title: 'Náufrago', original_title: 'Cast Away', popularity: 10 },
            { title: 'Forrest Gump: O Contador de Histórias', original_title: 'Forrest Gump', popularity: 50 },
            { name: 'Irmãos de Guerra', original_name: 'Band of Brothers', popularity: 20 },
          ],
          crew: [{ title: 'The Wonders', job: 'Director', popularity: 99 }],
        })
  const body = await (await ask('tom hanks', env)).json()
  assert.equal(body.name, 'Tom Hanks')
  assert.equal(body.directing, false)
  assert.deepEqual(body.titles, ['Forrest Gump: O Contador de Histórias', 'Forrest Gump', 'Irmãos de Guerra', 'Band of Brothers', 'Náufrago', 'Cast Away'])
})

test('pessoa: diretor devolve o que dirigiu', async () => {
  globalThis.fetch = async (url) =>
    String(url).includes('/search/person')
      ? Response.json({ results: [{ id: 525, name: 'Christopher Nolan', known_for_department: 'Directing' }] })
      : Response.json({ cast: [{ title: 'Ponta' }], crew: [{ title: 'Oppenheimer', job: 'Director' }, { title: 'Tenet', job: 'Writer' }] })
  assert.deepEqual((await (await ask('Nolan', env)).json()).titles, ['Oppenheimer'])
})

test('pessoa: nome que nao bate com o digitado, sem token, curto ou erro: 204', async () => {
  globalThis.fetch = async () => Response.json({ results: [{ id: 1, name: 'Keanu Reeves', known_for_department: 'Acting' }] })
  assert.equal((await ask('matrix', env)).status, 204)
  assert.equal((await ask('tom hanks', {})).status, 204)
  assert.equal((await ask('to', env)).status, 204)
  globalThis.fetch = async () => new Response('x', { status: 401 })
  assert.equal((await ask('tom hanks', env)).status, 204)
})
