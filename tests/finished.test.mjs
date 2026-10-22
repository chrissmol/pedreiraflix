import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isFinished } from '../src/lib/finished.ts'

const min = 60

test('filme de 2h: nos creditos (faltando 8 min) conta como visto, faltando 10 min nao', () => {
  assert.equal(isFinished('movie', 112 * min, 120 * min), true)
  assert.equal(isFinished('movie', 110 * min, 120 * min), false)
})

test('episodio de 45 min: faltando 3 min conta, faltando 5 min nao', () => {
  assert.equal(isFinished('series', 42 * min, 45 * min), true)
  assert.equal(isFinished('series', 40 * min, 45 * min), false)
})

test('episodio curto (22 min) nunca perde mais de 10% para os creditos', () => {
  assert.equal(isFinished('series', 19 * min, 22 * min), false)
  assert.equal(isFinished('series', 20 * min, 22 * min), true)
})

test('filme de 3h usa os 95%, e sem duracao nada conta', () => {
  assert.equal(isFinished('movie', 172 * min, 180 * min), true)
  assert.equal(isFinished('movie', 0, 0), false)
})
