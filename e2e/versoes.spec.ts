import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Print do Chris (27/10): o provedor cadastra o mesmo filme duas vezes (dublado e legendado). Sem o "[L]", que o app
// tira do nome, os dois cartoes ficavam identicos lado a lado.
test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=get_vod_streams&/, async (route) => {
    const list = await (await route.fetch()).json()
    const m = list.find((x: { stream_id: number }) => x.stream_id === 1)
    await route.fulfill({ json: m ? [...list, { ...m, stream_id: 901, name: `${m.name} [L]` }] : list })
  })
  await seedSession(page)
})

test('mesmo filme cadastrado duas vezes vira um cartao so, na lista e na busca', async ({ page }) => {
  await page.goto('/movies')
  const row = page.locator('section', { has: page.getByRole('heading', { name: 'Ação' }) })
  await expect(row.getByRole('button', { name: /Filme Explosivo/ })).toHaveCount(1)
  await page.goto('/search?q=filme%20explosivo')
  await expect(page.getByRole('button', { name: /Filme Explosivo/ })).toHaveCount(1)
})

test('na pagina do filme da para escolher a versao', async ({ page }) => {
  await page.goto('/movies/1')
  const versions = page.getByRole('group', { name: 'Versões' })
  await expect(versions.getByRole('button', { name: 'Versão 1' })).toHaveAttribute('aria-pressed', 'true')
  await versions.getByRole('button', { name: 'Legendado' }).click()
  await expect(page).toHaveURL(/\/movies\/901$/)
})
