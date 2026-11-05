import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Nome de ator longo quebra em duas linhas em vez de virar "Nicholas Gali…".
test('elenco: nome longo cabe em até duas linhas no computador', async ({ page }) => {
  const cast = [{ name: 'Nicholas Galitzine Montgomery', character: 'Adam / He-Man', photo: null }]
  await page.route('**/api/tmdb?*', (route) => route.fulfill({ json: { genres: [], year: null, rating: null, overview: null, imdbRating: null, cast } }))
  await seedSession(page)
  await page.goto('/movies/1')
  const nome = page.getByRole('region', { name: 'Elenco' }).getByText('Nicholas Galitzine Montgomery', { exact: true })
  await expect(nome).toBeVisible()
  const cortado = await nome.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
  expect(cortado).toBe(false)
})
