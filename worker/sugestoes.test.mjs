import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from './index.js'

// /api/sugestoes: o modelo devolve titulos e o Worker so repassa os nomes. Qualquer falha (sem binding, limite
// diario do plano gratis, resposta torta) vira 204 e o app fica com a busca normal.
const ask = (qs, env) => worker.fetch(new Request(`http://app/api/sugestoes?${qs}`, { headers: { 'cf-connecting-ip': String(Math.random()) } }), env, {})
const ai = (run) => ({ AI: { run } })

test('frase: devolve os titulos br e original, sem repetir', async () => {
  let pedido
  const res = await ask('q=comedia+anos+90', ai(async (model, input) => {
    pedido = input.messages[1].content
    return { response: 'Claro! [{"br":"Debi & Lóide","original":"Dumb and Dumber"},{"br":"Máscara","original":"Máscara"}]' }
  }))
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).titles, ['Debi & Lóide', 'Dumb and Dumber', 'Máscara'])
  assert.match(pedido, /comedia anos 90/)
})

test('parecidos: pergunta pela serie quando kind=tv', async () => {
  let pedido
  await ask('like=Dark&kind=tv', ai(async (m, input) => ((pedido = input.messages[1].content), { response: '[{"br":"1899","original":"1899"}]' })))
  assert.match(pedido, /séries parecidos com a série "Dark"/)
})

test('sem binding, erro do modelo (cota) ou resposta sem JSON: 204', async () => {
  assert.equal((await ask('q=terror', {})).status, 204)
  assert.equal((await ask('q=terror', ai(async () => { throw new Error('4006: daily free allocation') }))).status, 204)
  assert.equal((await ask('q=terror', ai(async () => ({ response: 'nao sei' })))).status, 204)
  assert.equal((await ask('', ai(async () => assert.fail('nao devia chamar')))).status, 204)
})
