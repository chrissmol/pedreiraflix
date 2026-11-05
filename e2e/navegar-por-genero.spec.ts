import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Chris (5/11/2026): categorias do provedor ("Filme Cinema Plus") atrapalham; navegar por gênero.
test('filmes: a lista não traz gênero, só tmdb_id; o gênero vem do TMDB e as fileiras são gêneros', async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=get_vod_streams(&|$)/, async (route) => {
    const lista = await (await route.fetch()).json()
    await route.fulfill({ json: lista.map((m: { stream_id: number }) => ({ ...m, genre: undefined, tmdb_id: String(m.stream_id) })) })
  })
  // Gênero 35 (Comédia): filmes 4 e 5; gênero 28 (Ação): 1 e 2. Os outros gêneros voltam vazios.
  await page.route('**/api/generos?*', (route) => {
    const g = new URL(route.request().url()).searchParams.get('genre')
    return route.fulfill({ json: { ids: g === '35' ? [4, 5] : g === '28' ? [1, 2] : [] } })
  })
  await login(page)
  await page.goto('/movies')
  await expect(page.getByRole('heading', { name: 'Comédia' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ação' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: /Filmes/, level: 2 })).toHaveCount(0)
})

test('séries: o gênero vem na lista e as fileiras são gêneros', async ({ page }) => {
  await login(page)
  await page.goto('/series')
  await expect(page.getByRole('heading', { name: 'Drama', level: 2 }).first()).toBeVisible()
})
