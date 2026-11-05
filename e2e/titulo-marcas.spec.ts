import { expect, test } from '@playwright/test'
import { displayChannel, displayTitle } from '../src/lib/displayTitle'

const casos: Array<[string, string]> = [
  ['- Dupla Perigosa', 'Dupla Perigosa'],
  ['+ Casa do Patrão', 'Casa do Patrão'],
  ['- Academia Sobrenatural: A Maldição [L] (2025) (2025)', 'Academia Sobrenatural: A Maldição (2025)'],
  ['| Dupla Perigosa', 'Dupla Perigosa'],
  ['|BR| Dupla Perigosa', 'Dupla Perigosa'],
  ['★ Dupla Perigosa ★', 'Dupla Perigosa'],
  ['🔥 Dupla Perigosa 🔥 [4K]', 'Dupla Perigosa'],
  ['Dupla Perigosa -', 'Dupla Perigosa'],
  ['DUPLA PERIGOSA (2024)', 'Dupla Perigosa (2024)'],
  ['A CASA DO DRAGÃO', 'A Casa do Dragão'],
  ['ROMEU E JULIETA', 'Romeu e Julieta'],
  ['O SENHOR DOS ANÉIS II', 'O Senhor dos Anéis II'],
  ['CSI: MIAMI', 'CSI: Miami'],
  ['FBI MOST WANTED', 'FBI Most Wanted'],
  ['SEM VOLTA PARA CASA', 'Sem Volta para Casa'],
  // Legítimos: não podem mudar.
  ['Spider-Man - Sem Volta', 'Spider-Man - Sem Volta'],
  ['3 + 1', '3 + 1'],
  ['+1', '+1'],
  ['WALL-E', 'Wall-E'],
  ['Wall-E', 'Wall-E'],
  ['S.W.A.T.', 'S.W.A.T.'],
  ['iCarly', 'iCarly'],
  ['Gran Turismo ©', 'Gran Turismo ©'],
  ['IT', 'IT'],
  ['2012', '2012'],
]

test('displayTitle limpa símbolos e CAIXA ALTA sem estragar títulos legítimos', () => {
  for (const [entrada, saida] of casos) expect(displayTitle(entrada), entrada).toBe(saida)
})

test('displayChannel limpa símbolos mas mantém a caixa do canal', () => {
  expect(displayChannel('|BR| GLOBO SP FHD')).toBe('GLOBO SP FHD')
  expect(displayChannel('★ ESPN 2 ★')).toBe('ESPN 2')
  expect(displayChannel('- SPORTV')).toBe('SPORTV')
})
