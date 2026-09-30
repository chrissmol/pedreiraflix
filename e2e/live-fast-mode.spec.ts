import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('live channels offer a "Rápido" low-latency toggle, and VOD does not', async ({ page }) => {
  await page.goto('/live')
  await page.getByText('Canal Notícias 24h').click()
  await expect(page).toHaveURL(/\/watch\/live\/101/)
  const video = page.locator('video')
  await expect(video).toBeVisible()
  await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement)?.readyState >= 1)

  await page.mouse.move(300, 300)
  await page.mouse.move(400, 300)
  const fastButton = page.getByRole('button', { name: /Rápido/ })
  await expect(fastButton).toBeVisible()
  await expect(fastButton).toHaveAttribute('aria-pressed', 'false')
  await expect(video).toBeVisible()
  await expect(page.getByText(/Erro|não foi possível|falhou/i)).toHaveCount(0)

  await page.goto('/movies/1')
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page).toHaveURL(/\/watch\/movie\/1/)
  await expect(page.getByRole('button', { name: /Rápido/ })).toHaveCount(0)
})
