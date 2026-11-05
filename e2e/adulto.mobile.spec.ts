import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test('celular: conteúdo adulto vem bloqueado por padrão', async ({ page }) => {
  await seedSession(page)
  await page.goto('/live')
  await expect(page.getByText('Canal Adulto')).toHaveCount(0)
  await page.goto('/movies')
  await expect(page.getByText('Filme Explosivo').first()).toBeVisible()
  await expect(page.getByText('Filme Adulto')).toHaveCount(0)
})
