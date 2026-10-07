import { expect, test } from '@playwright/test'
import { login, MOCK } from './helpers'

// Pedido do Christian (07/10): usuario e senha do provedor apareciam na URL de cada chamada ao proxy — e
// foram parar num log que ele colou no chat. Do login ao video tocando, nenhuma URL pode ter a senha.
test('do login ao video tocando, nenhuma URL leva a senha do provedor', async ({ page }) => {
  const leaked: string[] = []
  page.on('request', (req) => {
    if (decodeURIComponent(req.url()).includes(MOCK.password)) leaked.push(req.url())
  })

  await login(page)
  await page.getByRole('link', { name: 'Filmes' }).click()
  await page.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await expect(page.locator('video')).toBeVisible()
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)

  // Ao vivo e HLS: as URLs dos segmentos reescritas pelo proxy tambem nao podem trazer a senha de volta.
  await page.goto('/watch/live/101?name=Canal')
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)

  expect(leaked).toEqual([])
})
