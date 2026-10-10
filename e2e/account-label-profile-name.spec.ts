import { expect, test } from '@playwright/test'
import { MOCK } from './helpers'

test('a custom account name at login becomes the default profile name, shown in the account avatar', async ({ page }) => {
  await page.goto('/login')
  const other = page.getByRole('button', { name: '+ Usar outra conta' })
  if (await other.isVisible().catch(() => false)) await other.click()
  await page.getByLabel('Endereço do servidor').fill(MOCK.baseUrl)
  await page.getByLabel('Nome (opcional)').fill('Sala de TV')
  await page.getByLabel('Usuário', { exact: true }).fill(MOCK.username)
  await page.getByLabel('Senha', { exact: true }).fill(MOCK.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)

  // Avatar initial and the account menu both read the profile name, which should now be the chosen label.
  await expect(page.getByRole('button', { name: 'Conta', exact: true })).toHaveText('S')
  await page.getByRole('button', { name: 'Conta', exact: true }).click()
  await expect(page.getByText('Sala de TV', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Gerenciar perfis' }).click()
  await expect(page.getByText('Sala de TV')).toBeVisible()
})

test('an account whose default profile was never renamed picks up a label set later, without touching a name someone chose', async ({ page }) => {
  // Simulates a pre-existing user: profile already auto-created and named after the raw username, exactly
  // as ensureProfile would have left it before any label existed.
  await page.addInitScript((creds) => {
    const accId = `${creds.baseUrl.toLowerCase()}|${creds.username}`
    localStorage.setItem(
      'iptv-profiles',
      JSON.stringify({
        state: { byAccount: { [accId]: { profiles: [{ id: 'p1', name: creds.username, color: '#0f7bff' }], activeId: 'p1' } } },
        version: 0,
      }),
    )
  }, MOCK)

  await page.goto('/login')
  const other = page.getByRole('button', { name: '+ Usar outra conta' })
  if (await other.isVisible().catch(() => false)) await other.click()
  await page.getByLabel('Endereço do servidor').fill(MOCK.baseUrl)
  await page.getByLabel('Nome (opcional)').fill('Apelido Novo')
  await page.getByLabel('Usuário', { exact: true }).fill(MOCK.username)
  await page.getByLabel('Senha', { exact: true }).fill(MOCK.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)

  await expect(page.getByRole('button', { name: 'Conta', exact: true })).toHaveText('A')
})
