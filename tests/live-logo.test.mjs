import assert from 'node:assert/strict'
import { test } from 'node:test'
import { liveLogo } from '../src/lib/xtream.ts'

// Etiquetas de qualidade do ibb.co viravam dezenas de pedidos 520 no proxy (que tambem leva o video).
test('etiqueta de qualidade nao vira logo de canal', () => {
  for (const f of ['SD', 'HD', 'FHD', 'H265']) assert.equal(liveLogo(`https://i.ibb.co/jTZZKbK/${f}.png`), null)
})

test('logo normal continua pelo proxy', () => {
  assert.equal(liveLogo('https://i.ibb.co/abc/espn.png'), '/api/stream?url=https%3A%2F%2Fi.ibb.co%2Fabc%2Fespn.png')
  assert.equal(liveLogo(null), null)
})
