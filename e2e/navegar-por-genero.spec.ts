import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Chris (5/11/2026): categorias do provedor ("Filme Cinema Plus") atrapalham; com gênero na lista, navegar por ele.
test('filmes: com gênero na lista, as fileiras são os gêneros e não as categorias do provedor', async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=get_vod_streams(&|$)/, async (route) => {
    const lista = await (await route.fetch()).json()
    await route.fulfill({ json: lista.map((m: object, i: number) => ({ ...m, genre: i % 2 ? 'Comedy' : 'Ação, Aventura' })) })
  })
  await login(page)
  await page.goto('/movies')
  await expect(page.getByRole('heading', { name: 'Comédia' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Aventura' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Comedy' })).toHaveCount(0)
})
