import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Celular: a caixa da assinatura cabe no menu da conta sem rolar a pagina para o lado.
test('celular: o menu da conta mostra a assinatura e cabe na tela', async ({ page }) => {
  await login(page)
  const menu = page.getByRole('dialog', { name: 'Menu da conta' })
  await expect(async () => {
    if (!(await menu.isVisible())) await page.getByRole('button', { name: 'Conta', exact: true }).click()
    await expect(menu).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  await expect(page.getByTestId('assinatura')).toContainText(/Assinatura: faltam (29|30) dias/)
  const box = (await page.getByTestId('assinatura').boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
})
