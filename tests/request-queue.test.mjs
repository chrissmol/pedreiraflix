import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RequestThrottle } from '../src/lib/requestQueue.ts'

// Abrir um filme nao pode esperar o catalogo: com as vias todas ocupadas e mais coisa na fila de fundo,
// o pedido urgente comeca na hora, antes de qualquer item de fundo que ja estava esperando.
test('pedido urgente comeca antes do catalogo que ja estava na fila', async () => {
  const q = new RequestThrottle(0, 2)
  const started = []
  const gates = []
  const job = (name) => () => {
    started.push(name)
    return new Promise((resolve) => gates.push(resolve))
  }

  for (let i = 0; i < 5; i++) q.schedule(job(`fundo-${i}`))
  assert.deepEqual(started, ['fundo-0', 'fundo-1']) // as duas vias ocupadas

  q.schedule(job('filme'), 'urgent')
  assert.deepEqual(started, ['fundo-0', 'fundo-1', 'filme']) // via extra: nao esperou ninguem terminar

  // Liberando as vias, o fundo continua na ordem de antes.
  gates.forEach((g) => g())
  await new Promise((r) => setTimeout(r, 10))
  assert.deepEqual(started.slice(3, 5), ['fundo-2', 'fundo-3'])
})

test('sem nada urgente, a fila de fundo respeita o limite de vias', async () => {
  const q = new RequestThrottle(0, 3)
  let running = 0
  let peak = 0
  const work = () => {
    running++
    peak = Math.max(peak, running)
    return new Promise((r) => setTimeout(() => {
      running--
      r()
    }, 5))
  }
  await Promise.all(Array.from({ length: 12 }, () => q.schedule(work)))
  assert.equal(peak, 3)
})

// 09/10 (app do Windows do Christian): o provedor responde 429 depois de 2 ou 3 pedidos e o app seguia batendo,
// prolongando o castigo. Agora, depois de um 429, o catalogo em segundo plano PARA por um tempo, volta com um
// pedido de cada vez, e o que a pessoa pediu agora (urgente) continua passando.
test('429 pausa o fundo por um tempo; urgente passa; depois volta a andar', async () => {
  const q = new RequestThrottle(0, 3, 60, 1)
  q.reportRateLimited()
  const started = []
  const job = (name) => () => {
    started.push(name)
    return Promise.resolve(name)
  }
  const fundo = q.schedule(job('fundo'))
  const urgente = q.schedule(job('filme'), 'urgent')
  await urgente
  assert.deepEqual(started, ['filme']) // o fundo espera a pausa
  await new Promise((r) => setTimeout(r, 30))
  assert.deepEqual(started, ['filme']) // ainda pausado
  await fundo // acaba a pausa e ele roda
  assert.deepEqual(started, ['filme', 'fundo'])
})

test('Retry-After do provedor vale quando e maior que o tempo normal', async () => {
  const q = new RequestThrottle(0, 3, 20, 1)
  const t0 = Date.now()
  q.reportRateLimited(0.15) // 150 ms
  await q.schedule(() => Promise.resolve())
  assert.ok(Date.now() - t0 >= 140, `esperou ${Date.now() - t0} ms`)
})

test('logo depois do 429 anda uma via so; pedidos bons seguidos devolvem as tres', async () => {
  const q = new RequestThrottle(1, 3, 10, 40)
  q.reportRateLimited()
  await new Promise((r) => setTimeout(r, 30)) // fim da pausa
  let running = 0
  let peak = 0
  const work = () => {
    running++
    peak = Math.max(peak, running)
    return new Promise((r) => setTimeout(() => (running--, r()), 3))
  }
  await Promise.all(Array.from({ length: 4 }, () => q.schedule(work)))
  assert.equal(peak, 1) // uma via so
  for (let i = 0; i < 40; i++) q.reportSuccess() // pedidos bons: o intervalo volta ao normal (40 -> 1 ms)
  peak = 0
  await Promise.all(Array.from({ length: 9 }, () => q.schedule(work)))
  assert.ok(peak > 1, `pico ${peak}`)
})
