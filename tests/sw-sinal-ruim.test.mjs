import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// Sinal ruim ("lie-fi"): o servidor aceita a conexao e nunca responde. Com a tela guardada no cache, a
// navegacao tem que abrir a copia em segundos em vez de ficar pendurada ate o tempo limite do navegador.
// O service worker roda aqui com um `self`/`caches`/`fetch` de mentira: so a logica de public/sw.js importa.
function carregarSw({ rede }) {
  const handlers = {}
  const copia = new Response('app guardado')
  const cache = { put: async () => {}, match: async () => copia, keys: async () => [], delete: async () => true, add: async () => {} }
  const self = {
    location: { origin: 'http://app' },
    addEventListener: (tipo, fn) => (handlers[tipo] = fn),
    skipWaiting() {},
    clients: { claim: async () => {} },
  }
  const caches = { match: async () => copia, open: async () => cache, keys: async () => [], delete: async () => true }
  new Function('self', 'caches', 'fetch', readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'))(self, caches, rede)
  return { handlers, copia }
}

function navegar(handlers) {
  let resposta
  handlers.fetch({
    request: { method: 'GET', url: 'http://app/profiles', mode: 'navigate', headers: { get: () => null } },
    respondWith: (p) => (resposta = p),
  })
  return resposta
}

test('rede pendurada: abre a copia guardada em poucos segundos', async () => {
  const { handlers, copia } = carregarSw({ rede: () => new Promise(() => {}) })
  const res = await Promise.race([navegar(handlers), new Promise((r) => setTimeout(() => r('TRAVOU'), 9000))])
  assert.equal(res, copia)
})

test('rede boa: devolve a resposta da rede, nao a copia', async () => {
  const nova = new Response('app novo')
  const { handlers } = carregarSw({ rede: async () => nova })
  assert.equal(await navegar(handlers), nova)
})

test('sem rede (falha rapida): devolve a copia guardada', async () => {
  const { handlers, copia } = carregarSw({ rede: async () => { throw new TypeError('offline') } })
  assert.equal(await navegar(handlers), copia)
})
