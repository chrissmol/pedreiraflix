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
