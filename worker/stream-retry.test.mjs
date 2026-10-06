import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from './index.js'

const TARGET = 'https://provedor.example.com/live/seg.ts'
const ask = (extra = {}) =>
  worker.fetch(new Request(`http://app/api/stream?url=${encodeURIComponent(TARGET)}`, extra), {})

function stubFetch(responses) {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), range: init?.headers?.range })
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]
    if (next instanceof Error) throw next
    return next()
  }
  return calls
}

test('uma falha passageira do provedor e retentada, nao repassada para a TV', async () => {
  const calls = stubFetch([
    () => new Response('ops', { status: 502 }),
    () => new Response('ops', { status: 504 }),
    () => new Response('video', { status: 200, headers: { 'content-type': 'video/mp2t' } }),
  ])
  const res = await ask()
  assert.equal(res.status, 200)
  assert.equal(calls.length, 3, 'deve ter tentado tres vezes')
})

test('erro que nao adianta repetir passa direto, sem gastar tentativas', async () => {
  const calls = stubFetch([() => new Response('nao existe', { status: 404 })])
  const res = await ask()
  assert.equal(res.status, 404)
  assert.equal(calls.length, 1)
})

test('o cabecalho Range e preservado em todas as tentativas', async () => {
  const calls = stubFetch([
    () => new Response('ops', { status: 503 }),
    () => new Response('parcial', { status: 206, headers: { 'content-range': 'bytes 0-99/1000' } }),
  ])
  const res = await ask({ headers: { range: 'bytes=0-99' } })
  assert.equal(res.status, 206)
  assert.equal(res.headers.get('content-range'), 'bytes 0-99/1000')
  assert.ok(calls.every((c) => c.range === 'bytes=0-99'), 'Range precisa ir em toda tentativa')
})

test('se o provedor falha em todas, o erro chega como 502', async () => {
  stubFetch([() => new Response('ops', { status: 502 })])
  const res = await ask()
  assert.equal(res.status, 502)
})
