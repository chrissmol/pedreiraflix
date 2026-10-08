import assert from 'node:assert/strict'
import { test } from 'node:test'
import { channelGroupOf, cleanCategoryName } from '../src/lib/channelGroups.ts'

// Nomes reais das categorias do provedor do Christian (print de 08/10).
test('nome limpo: sem enfeites, sem caixa alta, siglas preservadas', () => {
  assert.equal(cleanCategoryName('★ GLOBO'), 'Globo')
  assert.equal(cleanCategoryName('⚽ NBA LEAGUE PASS'), 'NBA League Pass')
  assert.equal(cleanCategoryName('⚽ JOGOS DO DIA'), 'Jogos do Dia')
  assert.equal(cleanCategoryName('★ FILMES & SERIES'), 'Filmes & Series')
  assert.equal(cleanCategoryName('★ SBT'), 'SBT')
  assert.equal(cleanCategoryName('⚽ PARAMOUNT - FUTEBOL'), 'Paramount - Futebol')
  assert.equal(cleanCategoryName('Notícias'), 'Notícias')
  assert.equal(cleanCategoryName('★ RECORDTV'), 'Record TV')
  assert.equal(cleanCategoryName('⚽ SPORTV'), 'SporTV')
  assert.equal(cleanCategoryName('⚽ CAZÉ TV'), 'Cazé TV')
})

test('grupos pelas categorias reais', () => {
  const casos = {
    '★ GLOBO': 'TV aberta', '★ SBT': 'TV aberta', '★ RECORDTV': 'TV aberta', '★ BAND': 'TV aberta', '★ ABERTOS': 'TV aberta',
    '⚽ JOGOS DO DIA': 'Esportes', 'NBA LEAGUE PASS': 'Esportes', '⚽ PREMIERE': 'Esportes', '⚽ SPORTV': 'Esportes',
    '⚽ DISNEY+': 'Esportes', '⚽ PARAMOUNT - FUTEBOL': 'Esportes', '★ PARAMOUNT - UFC': 'Esportes', '⚽ PPV ESPORTES': 'Esportes', '★ NBA': 'Esportes',
    '★ TELECINE': 'Filmes e séries', '★ HBO': 'Filmes e séries', '★ FILMES & SERIES': 'Filmes e séries', '★ EVENTOS NETFLIX': 'Filmes e séries',
    '★ NOTÍCIAS': 'Notícias', '★ INFANTIL': 'Infantil',
    '★ 24HRS CANAIS': '24 horas', '★ 24 HRS SERIES': '24 horas', '★ 24 HRS DESENHO': '24 horas', '★ 24 HRS FILMES': '24 horas',
    '★ A FAZENDA 18': 'Outros', '★ RELIGIOSOS': 'Outros', '★ EXCLUSIVO': 'Outros', '★ PROGRAMACAO': 'Outros',
  }
  for (const [nome, grupo] of Object.entries(casos)) assert.equal(channelGroupOf(nome), grupo, nome)
})
