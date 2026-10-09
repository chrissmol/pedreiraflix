import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Contra o build de producao (service worker e telas guardadas), como no app instalado: sem internet, a conta
// salva entra com os dados guardados no aparelho (senao ninguem chegaria aos downloads); quando a conexao volta,
// a conta e conferida de verdade e o aviso some.
test('conta salva entra sem internet e e conferida quando a conexao volta', async ({ page, context }) => {
  await login(page) // "Lembrar" ja vem marcado: a conta fica salva
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/login$/)

  await context.setOffline(true)
  try {
    await page.reload()
    await expect(page.getByText('Sem internet: entre numa conta salva')).toBeVisible()
    await page.getByTestId('saved-accounts').getByRole('button').filter({ hasText: /demo|Entrar/ }).first().click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('Sem internet: dá para assistir os seus downloads.')).toBeVisible()
    await page.getByRole('button', { name: 'Conta' }).click()
    await page.getByRole('button', { name: 'Downloads', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
  await expect(page.getByText('Sem internet: dá para assistir os seus downloads.')).toHaveCount(0, { timeout: 15000 })
})
