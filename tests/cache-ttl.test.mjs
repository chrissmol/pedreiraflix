import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cached } from '../src/lib/cache.ts'

// TV ligada o dia todo: o que ja estava na memoria nunca era buscado de novo (so o que vinha do IndexedDB expirava),
// entao "no ar agora" e episodios novos ficavam velhos ate recarregar o app.
test('entrada em memoria com mais de 15 min devolve a velha e atualiza em segundo plano', async () => {
  const real = Date.now
  let now = real()
  Date.now = () => now
  try {
    assert.equal(await cached('k', async () => 'v1'), 'v1')
    now += 16 * 60 * 1000
    assert.equal(await cached('k', async () => 'v2'), 'v1')
    await new Promise((r) => setTimeout(r, 0))
    assert.equal(await cached('k', async () => 'v3'), 'v2')
  } finally {
    Date.now = real
  }
})
