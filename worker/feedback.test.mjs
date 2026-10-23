import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from './index.js'

// Suporte: o feedback dos amigos tem que chegar ao KV com o contexto, e texto vazio nao grava nada.
const post = (body, env, ip = '1.1.1.1') =>
  worker.fetch(
    new Request('http://app/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify(body),
    }),
    env,
  )

test('feedback vai para o KV com perfil, aparelho e pagina', async () => {
  const saved = new Map()
  let opts
  const env = { FEEDBACK: { put: async (k, v, o) => (saved.set(k, v), (opts = o)) } }
  const res = await post({ tipo: 'Problema', texto: ' canal travou ', perfil: 'Ana', aparelho: 'TV', pagina: '/live' }, env, '2.2.2.2')
  assert.equal(res.status, 204)
  const [item] = [...saved.values()].map((v) => JSON.parse(v))
  assert.equal(item.texto, 'canal travou')
  assert.equal(item.perfil, 'Ana')
  assert.equal(item.aparelho, 'TV')
  assert.equal(item.pagina, '/live')
  assert.equal(opts.expirationTtl, 180 * 86400)
})

test('feedback sem texto e recusado', async () => {
  const saved = new Map()
  const res = await post({ texto: '   ' }, { FEEDBACK: { put: async (k, v) => saved.set(k, v) } }, '3.3.3.3')
  assert.equal(res.status, 400)
  assert.equal(saved.size, 0)
})
