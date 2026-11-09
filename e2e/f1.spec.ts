import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Card "Fórmula 1" na aba Campeonatos. /api/f1 e simulado (formato do nosso Worker), nao a Jolpica de verdade.
const at = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()
const corrida = {
  race: {
    name: 'Abu Dhabi Grand Prix',
    round: 24,
    circuit: 'Yas Marina Circuit',
    place: 'Abu Dhabi, UAE',
    sessions: [
      { key: 'FirstPractice', name: 'Treino livre 1', start: at(30) },
      { key: 'Qualifying', name: 'Classificação', start: at(55) },
      { key: 'Race', name: 'Corrida', start: at(79) },
    ],
  },
}

async function seguirF1(page: import('@playwright/test').Page) {
  await seedSession(page)
  await page.goto('/times')
  await page.getByRole('tab', { name: 'Campeonatos' }).click()
  await page.getByRole('button', { name: 'Seguir um campeonato' }).click()
  await page.getByRole('button', { name: /^Automobilismo( \d+)?$/ }).click()
  await page.getByRole('button', { name: 'Fórmula 1' }).click()
  return page.getByRole('region', { name: 'Fórmula 1' })
}

test('seguir a F1 mostra a proxima etapa e as sessoes com horario local', async ({ page }) => {
  await page.route('**/api/f1', (route) => route.fulfill({ json: corrida }))
  const card = await seguirF1(page)
  await expect(card.getByText('Etapa 24 · Abu Dhabi Grand Prix')).toBeVisible()
  await expect(card.getByText('Yas Marina Circuit · Abu Dhabi, UAE')).toBeVisible()
  for (const nome of ['Treino livre 1', 'Classificação', 'Corrida']) await expect(card.getByText(nome, { exact: true })).toBeVisible()
  await expect(card.locator('li')).toHaveCount(3)
})

test('F1 indisponivel mostra aviso discreto com tentar de novo, sem quebrar a pagina', async ({ page }) => {
  await page.route('**/api/f1', (route) => route.fulfill({ status: 502, body: 'x' }))
  const card = await seguirF1(page)
  await expect(card.getByText('O calendário da F1 está indisponível agora.')).toBeVisible()
  await page.unroute('**/api/f1')
  await page.route('**/api/f1', (route) => route.fulfill({ json: { race: null } }))
  await card.getByRole('button', { name: /tentar/i }).click()
  await expect(card.getByText('Nenhuma corrida marcada por enquanto.')).toBeVisible()
})
