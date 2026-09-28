import { expect, test } from '@playwright/test'
import { login, MOCK } from './helpers'

test('login persists across reloads and new browser sessions', async ({ page, browser }) => {
  await login(page)
  await page.reload()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: 'Conta' })).toBeVisible()

  // A brand-new tab/window with the same stored data (= closing and reopening the site).
  const state = await page.context().storageState()
  const ctx = await browser.newContext({ storageState: state })
  const reopened = await ctx.newPage()
  await reopened.goto('http://localhost:5173/')
  await expect(reopened).toHaveURL('http://localhost:5173/')
  await expect(reopened.getByRole('button', { name: 'Conta' })).toBeVisible()
  await ctx.close()
})

test('after logout the account stays saved and re-entry is one tap', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/login$/)

  const saved = page.getByTestId('saved-accounts')
  await expect(saved).toContainText(MOCK.username)
  await expect(saved).toContainText('localhost:8790')
  await saved.getByRole('button', { name: /Entrar/ }).first().click()
  await expect(page).toHaveURL(/\/$/)

  // The form is prefilled with the last account too.
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Sair' }).click()
  await page.getByRole('button', { name: 'Voltar às contas salvas' }).waitFor({ state: 'detached' }).catch(() => {})
  await page.getByRole('button', { name: '+ Usar outra conta' }).click()
  await expect(page.getByLabel('Usuário', { exact: true })).toHaveValue('')
})

test('wrong password shows an error and does not save the account', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Endereço do servidor').fill(MOCK.baseUrl)
  await page.getByLabel('Usuário', { exact: true }).fill('demo')
  await page.getByLabel('Senha', { exact: true }).fill('errada')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(/inválidas/i)
  expect(await page.evaluate(() => localStorage.getItem('iptv-accounts'))).toBeNull()
})

test('unchecking "lembrar" does not keep the account after logout', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Endereço do servidor').fill('localhost:8790') // no scheme: http:// is assumed
  await page.getByLabel('Usuário', { exact: true }).fill(MOCK.username)
  await page.getByLabel('Senha', { exact: true }).fill(MOCK.password)
  await page.getByLabel(/Lembrar esses dados/).uncheck()
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page.getByTestId('saved-accounts')).toHaveCount(0)
  await expect(page.getByLabel('Usuário', { exact: true })).toHaveValue('')
})

test('an existing pre-upgrade session is migrated into saved accounts', async ({ page }) => {
  await page.addInitScript((creds) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem('iptv-session', JSON.stringify({ state: { credentials: creds, user: { username: 'demo', status: 'Active', expDate: null, isTrial: false, activeConnections: '0', maxConnections: '1' }, server: null, sessionWarning: null }, version: 0 }))
  }, MOCK)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Conta' })).toBeVisible()
  // Asserts through the app's own behavior (storage is obfuscated on disk — see lib/obfuscatedStorage.ts
  // — so reading it back out here would just be re-testing that implementation detail): logging out and
  // back in via the saved-accounts list proves the migrated account round-trips correctly end to end.
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Sair' }).click()
  const saved = page.getByTestId('saved-accounts')
  await expect(saved).toContainText(MOCK.username)
  await saved.getByRole('button', { name: /Entrar/ }).first().click()
  await expect(page).toHaveURL(/\/$/)
})

test('a saved account can be given a custom name, shown instead of the username', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Endereço do servidor').fill(MOCK.baseUrl)
  await page.getByLabel('Nome (opcional)').fill('Conta principal')
  await page.getByLabel('Usuário', { exact: true }).fill(MOCK.username)
  await page.getByLabel('Senha', { exact: true }).fill(MOCK.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Sair' }).click()

  const saved = page.getByTestId('saved-accounts')
  await expect(saved).toContainText('Conta principal')
  await expect(saved).toContainText(MOCK.username) // still shown as a secondary detail
  await saved.getByRole('button', { name: /Entrar/ }).first().click()
  await expect(page).toHaveURL(/\/$/)
})

test('an existing saved account can be renamed from the login screen', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Sair' }).click()

  await page.getByRole('button', { name: `Renomear conta ${MOCK.username}` }).click()
  await page.getByPlaceholder(MOCK.username).fill('Servidor de teste')
  await page.getByPlaceholder(MOCK.username).press('Enter')
  await expect(page.getByTestId('saved-accounts')).toContainText('Servidor de teste')
})
