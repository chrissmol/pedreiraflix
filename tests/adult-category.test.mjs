import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAdultCategoryName } from '../src/lib/adultCategory.ts'

test('reconhece categorias adultas pelo nome', () => {
  for (const nome of ['XXX', 'Adultos +18', 'ADULTOS', 'Canais 18+', 'Hot', 'Filmes Hot', 'Sensual', 'Erótico', 'Porn HD', 'Adult']) {
    assert.equal(isAdultCategoryName(nome), true, nome)
  }
})

test('nao pega palavras que so contem "hot" ou "adult" por acaso', () => {
  for (const nome of ['Hotel Transylvania', 'Photography', 'Ghost', 'Hotspot', 'Filmes', 'Infantil', 'Séries Dramáticas', 'Esportes']) {
    assert.equal(isAdultCategoryName(nome), false, nome)
  }
})
