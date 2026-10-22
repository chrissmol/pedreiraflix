import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Provider sends a movie with no genre/year/rating/plot; TMDB (mocked) fills the gaps. The provider's
// own values must win when present, which smoke.spec.ts already exercises with the plain mock data.
test('movie detail fills missing genre, year and plot from /api/tmdb and shows only the IMDb rating', async ({ page }) => {
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
  await expect(page.getByText('★ 7.4')).toHaveCount(0)
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

test('serie mostra a nota do IMDb (busca com kind=tv)', async ({ page }) => {
  let pedido = ''
  await page.route('**/api/tmdb?*', (route) => {
    pedido = route.request().url()
    return route.fulfill({ json: { genres: [], year: null, rating: null, overview: null, imdbRating: '9.1' } })
  })
  await login(page)
  await page.goto('/series/50')
  await expect(page.getByText('IMDb 9.1')).toBeVisible()
  expect(pedido).toContain('kind=tv')
})

// Pedido do Chris (22/10): as estrelas dos posteres e do destaque mostram a nota do IMDb, nao a do provedor.
test('posteres mostram a nota do IMDb no lugar da nota do provedor', async ({ page }) => {
  await page.route('**/api/tmdb?*', (route) => {
    const title = new URL(route.request().url()).searchParams.get('title')
    return route.fulfill({ json: { genres: [], year: null, overview: null, imdbRating: title === 'Filme Explosivo' ? '6.6' : null } })
  })
  await login(page)
  await page.goto('/movies')
  await expect(page.getByText('★ 6.6').first()).toBeVisible()
  // 8.1 e 9.0 sao notas do provedor no mock: nao aparecem mais.
  await expect(page.getByText('★ 8.1')).toHaveCount(0)
  await expect(page.getByText('★ 9.0')).toHaveCount(0)
})
