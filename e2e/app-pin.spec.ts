import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('app-wide PIN locks the whole app after reload and unlocks with the right code', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Gerenciar perfis' }).click()

  await expect(page.getByText('PIN do app desativado')).toBeVisible()
  await page.getByPlaceholder('0000').fill('1234')
  await page.getByRole('button', { name: 'Definir' }).click()
  await expect(page.getByText('PIN do app ativo')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('PIN do app')).toBeVisible()
  // The login/profile UI underneath must not be usable while locked.
  await expect(page.getByRole('button', { name: 'Conta' })).toHaveCount(0)

  await page.getByLabel('PIN do app').fill('0000')
  await expect(page.getByText('PIN incorreto')).toBeVisible()

  await page.getByLabel('PIN do app').fill('1234')
  await expect(page.getByLabel('PIN do app')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Perfis' })).toBeVisible()

  // Removing the PIN stops asking for it.
  await page.getByRole('button', { name: 'Remover' }).click()
  await page.reload()
  await expect(page.getByLabel('PIN do app')).toHaveCount(0)
})
