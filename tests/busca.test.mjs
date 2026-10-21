import assert from 'node:assert/strict'
import { test } from 'node:test'
import { searchCatalog } from '../src/lib/search.ts'

const grupo = (categoria, nomes, base) => ({ category: { categoryName: categoria }, items: nomes.map((name, i) => ({ name, streamId: base + i })) })
const catalogo = [
  grupo('Ação', ['O Retorno do Homem-Aranha', 'Aranha Negra', 'Homem-Aranha [L] (2002) (2002)', 'Homem-Aranha 2'], 100),
  grupo('Terror', ['A Freira', 'Invocação'], 200),
]
const nomes = (q) => searchCatalog(catalogo, q).map((h) => h.item.name)

test('o nome igual vem primeiro, depois o que comeca com a busca, depois o que contem', () => {
  assert.deepEqual(nomes('homem aranha'), ['Homem-Aranha [L] (2002) (2002)', 'Homem-Aranha 2', 'O Retorno do Homem-Aranha'])
})

test('nome bate antes da categoria, e a categoria sozinha tambem traz resultados', () => {
  assert.equal(nomes('acao')[0], 'Invocação')
  assert.deepEqual(nomes('terror'), ['A Freira', 'Invocação'])
})

test('aceita um erro de digitacao quando nada bate exato', () => {
  assert.equal(nomes('homen aranha').length, 3)
  assert.deepEqual(nomes('xyzw'), [])
})
