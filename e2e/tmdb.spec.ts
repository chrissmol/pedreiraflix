import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Provider sends a movie with no genre/year/rating/plot; TMDB (mocked) fills the gaps. The provider's
// own values must win when present, which smoke.spec.ts already exercises with the plain mock data.
test('movie detail fills missing genre, year, rating and plot from /api/tmdb', async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=get_vod_info/, async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    Object.assign(json.info, { genre: '', releasedate: '', rating: '0', plot: '' })
    await route.fulfill({ response: res, json })
  })
  await page.route('**/api/tmdb?*', (route) =>
    route.fulfill({ json: { genres: ['Ficção científica', 'Aventura'], year: '2014', rating: 7.4, overview: 'Sinopse vinda do TMDB.', imdbRating: '7.8' } }),
  )

  await login(page)
  await page.goto('/movies/1')
  await expect(page.getByText('Ficção científica, Aventura')).toBeVisible()
  await expect(page.getByText('2014')).toBeVisible()
  await expect(page.getByText('★ 7.4')).toBeVisible()
  await expect(page.getByText('IMDb 7.8')).toBeVisible()
  await expect(page.getByText('Sinopse vinda do TMDB.')).toBeVisible()
  await expect(page.getByText(/Dados complementares do TMDB/)).toBeVisible()
})

test('movie detail still renders when /api/tmdb has no data', async ({ page }) => {
  await page.route('**/api/tmdb?*', (route) => route.fulfill({ status: 204 }))
  await login(page)
  await page.goto('/movies/1')
  await expect(page.getByRole('heading', { name: 'Filme Explosivo' })).toBeVisible()
  await expect(page.getByText('Sinopse de Filme Explosivo.')).toBeVisible()
})
