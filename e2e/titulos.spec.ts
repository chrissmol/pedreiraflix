import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Paginas de detalhe tambem sem os enfeites do provedor (como destaque e posteres).
test('pagina do filme mostra o titulo sem [L] e sem ano repetido', async ({ page }) => {
  await page.route(/action=get_vod_info/, async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    json.movie_data.name = 'Filme Explosivo [L] (2025) (2025)'
    if (json.info) json.info.name = 'Filme Explosivo [L] (2025) (2025)'
    await route.fulfill({ response: res, json })
  })
  await seedSession(page)
  await page.goto('/movies/1')
  await expect(page.getByRole('heading', { level: 1, name: 'Filme Explosivo (2025)', exact: true })).toBeVisible()
})
