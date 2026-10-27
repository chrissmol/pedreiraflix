import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('Da mesma saga: so o que existe no catalogo, na ordem da saga, sem o proprio filme', async ({ page }) => {
  await page.route('**/api/saga?*', (route) =>
    route.fulfill({
      json: {
        name: 'Coleção Teste',
        parts: [
          { title: 'Risada Garantida', original: 'Guaranteed Laugh', year: '2010' },
          { title: 'Filme Que Nao Existe', original: 'Nope', year: '2012' },
          { title: 'Filme Explosivo', original: 'Explosive Movie', year: '2023' },
          { title: 'A Grande Corrida', original: 'Corrida Final', year: '2024' },
        ],
      },
    }),
  )
  await page.goto('/movies/1')
  const fileira = page.locator('section', { has: page.getByRole('heading', { name: 'Da mesma saga' }) })
  const cards = fileira.getByRole('button', { name: /Risada Garantida|Corrida Final/ })
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toContainText('Risada Garantida')
  await expect(fileira.getByRole('button', { name: /Filme Explosivo/ })).toHaveCount(0)
})

test('Da mesma saga: filme sem saga (204) nao mostra a fileira', async ({ page }) => {
  await page.route('**/api/saga?*', (route) => route.fulfill({ status: 204 }))
  await page.goto('/movies/1')
  await expect(page.getByRole('button', { name: 'Assistir' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Da mesma saga' })).toHaveCount(0)
})
