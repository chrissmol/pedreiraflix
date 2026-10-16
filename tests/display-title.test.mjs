import assert from 'node:assert/strict'
import { test } from 'node:test'
import { displayTitle } from '../src/lib/displayTitle.ts'

// Titulo real do destaque no painel do Christian (08/10).
test('tira marcas entre colchetes e o ano repetido', () => {
  assert.equal(displayTitle('Purgatorio - Limbo - Arafta - Bound by Fate [L] (2025) (2025) (2025)'), 'Purgatorio - Limbo - Arafta - Bound by Fate (2025)')
  assert.equal(displayTitle('[4K] Duna: Parte Dois (2024)'), 'Duna: Parte Dois (2024)')
  assert.equal(displayTitle('Filme Explosivo'), 'Filme Explosivo')
  assert.equal(displayTitle('[FHD] ★ SPORTV 2 ⚽ (2025) (2025)'), 'SPORTV 2 (2025)')
  assert.equal(displayTitle('Série (2019) (2020)'), 'Série (2019) (2020)')
})
