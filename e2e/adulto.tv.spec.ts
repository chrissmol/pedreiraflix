import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.use({
  userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
  viewport: { width: 960, height: 540 },
})

test('TV: conteúdo adulto vem bloqueado por padrão e o interruptor liga com OK (Enter)', async ({ page }) => {
  await seedSession(page)
  await page.goto('/live')
  await expect(page.getByText('Canal Adulto')).toHaveCount(0)
  await page.goto('/profiles')
  await page.getByLabel('Mostrar conteúdo adulto').focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Tenho 18 anos ou mais' }).click()
  await page.goto('/live')
  await expect(page.getByText('Canal Adulto')).toBeVisible()
})
