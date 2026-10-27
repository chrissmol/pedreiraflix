import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Celular: os botoes de humor quebram linha sem rolar a pagina de lado, e o logo do destaque cabe na tela.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

test('celular: humor cabe na tela e o logo do filme aparece no lugar do nome', async ({ page }) => {
  await seedSession(page)
  await page.route('**/api/tmdb?*', (route) => route.fulfill({ json: { genres: [], overview: null, logo: 'https://image.tmdb.org/t/p/w500/logo.png', certification: '12' } }))
  await page.route(/\/api\/stream\?url=https%3A%2F%2Fimage\.tmdb\.org/, (route) => route.fulfill({ contentType: 'image/png', body: PNG }))
  await page.goto('/search')
  await expect(page.getByRole('button', { name: 'Baseado em fatos' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth))
  await page.goto('/movies/1')
  const logo = page.getByRole('heading', { level: 1 }).getByRole('img', { name: 'Filme Explosivo' })
  await expect(logo).toBeVisible()
  expect((await logo.boundingBox())!.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth))
  await expect(page.getByTitle('Não recomendado para menores de 12 anos')).toBeVisible()
})
