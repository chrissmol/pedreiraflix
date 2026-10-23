import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('celular: Trocar conta no menu mostra as contas salvas e volta para a atual', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Conta', exact: true }).click()
  await page.getByRole('button', { name: 'Trocar conta' }).click()
  await expect(page.getByRole('heading', { name: 'Escolha uma conta salva' })).toBeVisible()
  await expect(page.getByRole('button', { name: '+ Usar outra conta' })).toBeInViewport()
  await page.getByRole('button', { name: 'Continuar na conta atual' }).click()
  await expect(page).toHaveURL(/\/$/)
})
