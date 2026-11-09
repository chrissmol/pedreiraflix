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

// Print do Chris (09/11): "Máquina de Guerra" e "Máquina de Guerra (2026)" apareciam como dois cartoes.
test('copia sem ano entra na obra que tem ano; refilmagens de anos diferentes continuam separadas', () => {
  const out = mergeVersions([m(1, 'Máquina de Guerra'), m(2, 'Máquina de Guerra (2026)'), m(3, 'Duna (1984)'), m(4, 'Duna (2021)'), m(5, 'Duna')])
  assert.deepEqual(out.map((x) => x.streamId), [1, 3, 4])
  assert.deepEqual(out[0].versions.map((x) => x.streamId), [1, 2])
  assert.deepEqual(out[1].versions.map((x) => x.streamId), [3, 5])
  assert.deepEqual(firstPerWork([m(2, 'Máquina de Guerra (2026)'), m(1, 'Máquina de Guerra')]).map((x) => x.streamId), [2])
})

test('juntar de novo itens ja juntados (fileira de genero) nao repete versoes', () => {
  const a = mergeVersions([m(1, 'Máquina de Guerra'), m(3, 'Máquina de Guerra [L]')])
  const b = mergeVersions([m(2, 'Máquina de Guerra (2026)'), m(1, 'Máquina de Guerra')])
  const out = mergeVersions([...a, ...b])
  assert.equal(out.length, 1)
  assert.deepEqual(out[0].versions.map((x) => x.streamId).sort(), [1, 2, 3])
})

test('Jumanji 1995 e 2017 ficam separados, e um "Jumanji" sem ano nao entra em nenhum', () => {
  const out = mergeVersions([m(1, 'Jumanji (1995)'), m(2, 'Jumanji (2017)'), m(3, 'Jumanji'), m(4, 'Jumanji [L] (2017)')])
  assert.deepEqual(out.map((x) => x.streamId), [1, 2, 3])
  assert.deepEqual(out[1].versions.map((x) => x.streamId), [2, 4])
})
