import assert from 'node:assert/strict'
import { test } from 'node:test'
import { displayTitle, episodeName, episodeTitle, movieYear } from '../src/lib/displayTitle.ts'

// Titulo real do destaque no painel do Christian (08/10).
test('tira marcas entre colchetes e o ano repetido', () => {
  assert.equal(displayTitle('Purgatorio - Limbo - Arafta - Bound by Fate [L] (2025) (2025) (2025)'), 'Purgatorio - Limbo - Arafta - Bound by Fate (2025)')
  assert.equal(displayTitle('[4K] Duna: Parte Dois (2024)'), 'Duna: Parte Dois (2024)')
  assert.equal(displayTitle('Filme Explosivo'), 'Filme Explosivo')
  assert.equal(displayTitle('[FHD] ★ SPORTV 2 ⚽ (2025) (2025)'), 'SPORTV 2 (2025)')
  assert.equal(displayTitle('Série (2019) (2020)'), 'Série (2019) (2020)')
})

test('ano do filme: campo year do painel, senao o (2024) do nome', () => {
  assert.equal(movieYear({ name: 'Duna (2021)', year: '2024' }), 2024)
  assert.equal(movieYear({ name: 'Purgatorio [L] (2025) (2025)' }), 2025)
  assert.equal(movieYear({ name: 'Filme Explosivo', year: '' }), null)
  assert.equal(movieYear({ name: 'Blade Runner 2049' }), null)
})

test('episodio sem repetir o nome da serie', () => {
  assert.equal(episodeName('Breaking Bad', 'Breaking Bad S01E02'), 'Breaking Bad - S01E02')
  assert.equal(episodeName('Breaking Bad (2008)', 'Breaking Bad - S01E02 - Gato no Saco'), 'Breaking Bad (2008) - S01E02 - Gato no Saco')
  assert.equal(episodeName('Série Dramática', 'T1E1 - Episódio 1'), 'Série Dramática - T1E1 - Episódio 1')
  assert.equal(episodeTitle('Lost', 'Lostgirl S01E01'), 'Lostgirl S01E01')
  assert.equal(episodeTitle('Dark', 'dark: S02E03'), 'S02E03')
  assert.equal(episodeTitle('Dark', 'Dark'), 'Dark')
})
