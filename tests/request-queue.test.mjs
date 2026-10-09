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
  for (let i = 0; i < 400; i++) q.reportSuccess() // muitos pedidos bons: o intervalo e o piso voltam ao normal
  peak = 0
  await Promise.all(Array.from({ length: 9 }, () => q.schedule(work)))
  assert.ok(peak > 1, `pico ${peak}`)
})

// Depois do 429 o ritmo NAO volta ao de antes na hora (isso repetia o 429 em ciclos): o intervalo desce so ate um piso
// aprendido, e o piso so cai depois de muitos pedidos bons seguidos.
test('o ritmo que levou ao 429 nao volta na hora: o intervalo para num piso', async () => {
  const q = new RequestThrottle(10, 3, 5, 1000) // base 10 ms, castigo 1000 ms -> piso = 250 ms
  q.reportRateLimited()
  const gap = () => q['gapMs']
  for (let i = 0; i < 35; i++) q.reportSuccess() // 7 degraus de 5: 1000 -> ... desce so ate o piso
  assert.equal(gap(), 250, 'parou no piso, nao no ritmo original')
  assert.equal(q.degraded, true) // ainda cauteloso: programacao dos canais continua pulada
  for (let i = 0; i < 40; i++) q.reportSuccess() // muitos pedidos bons no piso: o piso cai pela metade
  for (let i = 0; i < 5; i++) q.reportSuccess() // e o intervalo acompanha
  assert.ok(gap() <= 125, `intervalo ${gap()}`)
  for (let i = 0; i < 400; i++) q.reportSuccess()
  await new Promise((r) => setTimeout(r, 10)) // fim da pausa do 429
  assert.equal(gap(), 10)
  assert.equal(q.degraded, false)
})

test('429 seguidos sobem o piso (dobra) em vez de voltar ao mesmo ritmo', async () => {
  const q = new RequestThrottle(10, 3, 5, 1000)
  q.reportRateLimited()
  for (let i = 0; i < 35; i++) q.reportSuccess() // intervalo no piso (250)
  q.reportRateLimited() // limitou de novo com esse ritmo
  for (let i = 0; i < 30; i++) q.reportSuccess() // 5 para descer ate o piso novo e ainda longe de baixa-lo (40)
  assert.equal(q['gapMs'], 500, 'o piso dobrou')
})

// Programacao dos canais e enfeite: pedido "descartavel" cuja hora chega com o provedor limitando e recusado na fila,
// sem ocupar via nem esperar o intervalo — nao gasta a cota que faria os canais carregarem.
test('pedido descartavel e recusado na fila sem ocupar a via', async () => {
  const q = new RequestThrottle(0, 1, 5, 1)
  let degradado = false
  const ran = []
  const job = (n) => () => (ran.push(n), Promise.resolve(n))
  const drop = () => (degradado ? new Error('pulado') : null)
  const a = q.schedule(job('a'))
  const b = q.schedule(job('epg-b'), 'background', drop)
  const c = q.schedule(job('epg-c'), 'background', drop)
  const d = q.schedule(job('d'))
  degradado = true // o provedor passou a limitar enquanto eles esperavam
  await a
  await assert.rejects(b, /pulado/)
  await assert.rejects(c, /pulado/)
  await d
  assert.deepEqual(ran, ['a', 'd']) // os dois da programacao nunca foram a rede
})
