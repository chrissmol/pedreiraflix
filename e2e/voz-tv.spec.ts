import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('fora da TV o menu de exibição não oferece "Voz mais alta"', async ({ page }) => {
  await page.goto('/watch/movie/1?ext=mp4&name=Filme')
  await page.getByRole('button', { name: 'Ajustes de exibição' }).click()
  await expect(page.getByRole('button', { name: 'Ajustar' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Voz mais alta/ })).toHaveCount(0)
})

test.describe('TV', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })
  test('TV: "Voz mais alta" liga, desliga e fica lembrado', async ({ page }) => {
    await page.goto('/watch/movie/1?ext=mp4&name=Filme')
    await page.getByRole('button', { name: 'Ajustes de exibição' }).click()
    const voz = page.getByRole('button', { name: /Voz mais alta/ })
    await expect(voz).toHaveAttribute('aria-pressed', 'false')
    await voz.click()
    await expect(voz).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    await page.getByRole('button', { name: 'Ajustes de exibição' }).click()
    await expect(page.getByRole('button', { name: /Voz mais alta/ })).toHaveAttribute('aria-pressed', 'true')
  })
})
