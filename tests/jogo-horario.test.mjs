import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchWhen } from '../src/lib/matchTime.ts'

const now = new Date(2030, 9, 26, 15, 0).getTime() // sabado 26/10, 15:00 no fuso local
const at = (d, h, m = 0) => new Date(2030, 9, d, h, m).toISOString()

test('hoje, amanha e outro dia', () => {
  assert.equal(matchWhen(at(26, 21), 'scheduled', now).day, 'Hoje')
  assert.equal(matchWhen(at(27, 0, 30), 'scheduled', now).day, 'Amanhã')
  assert.match(matchWhen(at(30, 21), 'scheduled', now).day, /30\/10/)
})

test('contagem so quando falta menos de um dia', () => {
  assert.equal(matchWhen(at(26, 15, 40), 'scheduled', now).countdown, 'em 40 min')
  assert.equal(matchWhen(at(26, 18, 18), 'scheduled', now).countdown, 'em 3 h 18 min')
  assert.equal(matchWhen(at(26, 17), 'scheduled', now).countdown, 'em 2 h')
  assert.equal(matchWhen(at(28, 15), 'scheduled', now).countdown, null)
})

test('ao vivo pelo status ou pelo relogio, nunca depois de encerrado', () => {
  assert.equal(matchWhen(at(26, 14), 'scheduled', now).live, true)
  assert.equal(matchWhen(at(26, 12), 'scheduled', now).live, false)
  assert.equal(matchWhen(at(26, 12), 'IN_PLAY', now).live, true)
  assert.equal(matchWhen(at(26, 14), 'FINISHED', now).live, false)
  assert.equal(matchWhen(at(26, 16), 'scheduled', now).live, false)
})
