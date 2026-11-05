import { expect, test } from '@playwright/test'
import { displayTitle } from '../src/lib/displayTitle'

test('displayTitle tira o "- " e o "+ " que o provedor põe na frente', () => {
  expect(displayTitle('- Dupla Perigosa')).toBe('Dupla Perigosa')
  expect(displayTitle('+ Casa do Patrão')).toBe('Casa do Patrão')
  expect(displayTitle('- Academia Sobrenatural: A Maldição [L] (2025) (2025)')).toBe('Academia Sobrenatural: A Maldição (2025)')
  expect(displayTitle('Spider-Man - Sem Volta')).toBe('Spider-Man - Sem Volta')
  expect(displayTitle('3 + 1')).toBe('3 + 1')
})
