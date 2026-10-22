import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Celular: busca por frase pelo campo da pagina e a fileira "Parecidos" cabem na tela e abrem com um toque.
test('celular: frase no campo da busca e "Parecidos" na pagina do filme', async ({ page }) => {
  await seedSession(page)
  await page.route('**/api/sugestoes?*', (route) => route.fulfill({ json: { titles: ['Amor e Confusão', 'Corrida Final'] } }))
  await page.goto('/search')
  await page.getByRole('searchbox', { name: 'Buscar no catálogo' }).fill('algo leve para rir')
  await page.getByRole('heading', { name: 'Combina com a sua busca' }).waitFor()
  await page.getByRole('button', { name: /Amor e Confusão/ }).tap()
  await expect(page).toHaveURL(/\/movies\/5$/)
  await expect(page.getByRole('heading', { name: 'Parecidos com este' })).toBeVisible()
  await page.getByRole('button', { name: /Corrida Final/ }).tap()
  await expect(page).toHaveURL(/\/movies\/2$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
})
