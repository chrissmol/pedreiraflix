import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('celular: painel Episodios abre no toque, cabe na tela e fecha tocando fora ou com o Voltar', async ({ page }) => {
  await page.goto(`/watch/series/5012?ext=mp4&name=${encodeURIComponent('Série Dramática - T1E2 - Episódio 2')}&seriesId=50`)
  const botao = page.getByRole('button', { name: 'Episódios' })
  await expect(botao).toHaveCount(1)
  await page.locator('video').tap()
  await botao.tap()
  const painel = page.getByRole('dialog', { name: 'Episódios' })
  await expect(painel.getByText('T1E3 - Episódio 3')).toBeVisible()
  const box = (await painel.locator('> div').last().boundingBox())!
  const vw = page.viewportSize()!.width
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(vw)

  await page.mouse.click(5, 5) // fora do painel
  await expect(painel).toHaveCount(0)

  await page.locator('video').tap()
  await botao.tap()
  await expect(painel).toBeVisible()
  await page.goBack() // Voltar do Android
  await expect(painel).toHaveCount(0)
  await expect(page).toHaveURL(/\/watch\/series\/5012/)
})
