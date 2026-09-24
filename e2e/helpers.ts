import { expect, type Page } from '@playwright/test'

export const MOCK = { baseUrl: 'http://localhost:8790', username: 'demo', password: 'demo123' }

/** Logs in through the real form (works whether or not saved accounts are shown). */
export async function login(page: Page) {
  await page.goto('/login')
  const other = page.getByRole('button', { name: '+ Usar outra conta' })
  if (await other.isVisible().catch(() => false)) await other.click()
  await page.getByLabel('Endereço do servidor').fill(MOCK.baseUrl)
  await page.getByLabel('Usuário', { exact: true }).fill(MOCK.username)
  await page.getByLabel('Senha', { exact: true }).fill(MOCK.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
}

/** Skips the login UI by seeding the persisted session directly (fast path for non-auth tests). */
export async function seedSession(page: Page) {
  await page.addInitScript((creds) => {
    if (localStorage.getItem('iptv-session')) return
    const user = { username: creds.username, status: 'Active', expDate: null, isTrial: false, activeConnections: '0', maxConnections: '2' }
    const server = { url: 'localhost', serverName: 'Mock Panel', timezone: 'America/Sao_Paulo' }
    localStorage.setItem('iptv-session', JSON.stringify({ state: { credentials: creds, user, server, sessionWarning: null }, version: 0 }))
  }, MOCK)
}
