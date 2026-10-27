import assert from 'node:assert/strict'
import { test } from 'node:test'
import { firstPerWork, mergeVersions, versionLabel } from '../src/lib/versions.ts'

const m = (streamId, name) => ({ streamId, name })

// Print do Chris (27/10): dois cartoes iguais de "Forrest Gump: O Contador de Historias (1994)".
test('junta a mesma obra numa categoria e guarda as versoes, sem mexer nos itens recebidos', () => {
  const items = [m(1, 'Forrest Gump: O Contador de Histórias (1994)'), m(2, 'Duna (2021)'), m(3, 'Forrest Gump: O Contador de Histórias [L] (1994)'), m(4, 'Duna (1984)')]
  const out = mergeVersions(items)
  assert.deepEqual(out.map((x) => x.streamId), [1, 2, 4])
  assert.deepEqual(out[0].versions.map((x) => x.streamId), [1, 3])
  assert.equal(items[0].versions, undefined)
  assert.equal(mergeVersions(items)[0].versions.length, 2)
})

test('um por obra numa lista de varias categorias', () => {
  assert.deepEqual(firstPerWork([m(1, 'Forrest Gump (1994)'), m(9, 'forrest gump [4K] (1994)'), m(2, 'Náufrago')]).map((x) => x.streamId), [1, 2])
})

test('nome da versao vem das marcas do provedor', () => {
  assert.equal(versionLabel('Forrest Gump [L] (1994)', 1), 'Legendado')
  assert.equal(versionLabel('[4K] [DUB] Forrest Gump', 0), '4K · Dublado')
  assert.equal(versionLabel('Forrest Gump (1994)', 1), 'Versão 2')
})
