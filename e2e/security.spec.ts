import { expect, test } from '@playwright/test'
import { login, MOCK } from './helpers'

test('security headers are present on proxy responses', async ({ request }) => {
  const res = await request.get(
    `/api/xtream?base=${encodeURIComponent(MOCK.baseUrl)}&path=player_api.php&username=${MOCK.username}&password=${MOCK.password}`,
  )
  expect(res.headers()['x-content-type-options']).toBe('nosniff')
  expect(res.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
})

test('excessive requests to /api/xtream get rate-limited with 429', async ({ request }) => {
  // Every request in this whole suite comes from the same IP (127.0.0.1), same as a real client's IP
  // would be, and every spec file reuses the same running proxy — so this waits out a full window
  // *before* starting too, guaranteeing a clean bucket regardless of how much other tests' ordinary
  // traffic (catalog loads, EPG, search suggestions...) already put into it moments earlier.
  await new Promise((resolve) => setTimeout(resolve, 10_500))

  const url = `/api/xtream?base=${encodeURIComponent(MOCK.baseUrl)}&path=player_api.php&username=${MOCK.username}&password=${MOCK.password}&action=get_live_categories`
  const statuses: number[] = []
  for (let i = 0; i < 310; i++) statuses.push((await request.get(url)).status())
  expect(statuses).toContain(429)
  // The very first requests, before the limit trips, must have gone through normally.
  expect(statuses[0]).toBe(200)

  // Waits out the window afterward too, so the *next* test to hit /api/xtream doesn't inherit a false 429.
  await new Promise((resolve) => setTimeout(resolve, 10_500))
})

test('the Xtream password is not stored in plaintext in localStorage', async ({ page }) => {
  await login(page)
  const raw = await page.evaluate(() => ({
    session: localStorage.getItem('iptv-session'),
    accounts: localStorage.getItem('iptv-accounts'),
  }))
  expect(raw.session).not.toBeNull()
  expect(raw.accounts).not.toBeNull()
  expect(raw.session).not.toContain(MOCK.password)
  expect(raw.accounts).not.toContain(MOCK.password)
  // Still round-trips correctly through the app itself.
  await page.reload()
  await expect(page).toHaveURL(/\/$/)
})

test('a plaintext pre-obfuscation session (from an older app version) still logs in', async ({ page }) => {
  await page.addInitScript((creds) => {
    if (sessionStorage.getItem('seeded-plaintext')) return
    sessionStorage.setItem('seeded-plaintext', '1')
    const user = { username: creds.username, status: 'Active', expDate: null, isTrial: false, activeConnections: '0', maxConnections: '2' }
    const server = { url: 'localhost', serverName: 'Mock Panel', timezone: 'America/Sao_Paulo' }
    localStorage.setItem('iptv-session', JSON.stringify({ state: { credentials: creds, user, server, sessionWarning: null }, version: 0 }))
  }, MOCK)
  await page.goto('/')
  await expect(page).toHaveURL('http://localhost:5173/')
  await expect(page.getByRole('button', { name: 'Conta' })).toBeVisible()

  // And it gets re-saved obfuscated going forward.
  const raw = await page.evaluate(() => localStorage.getItem('iptv-session'))
  expect(raw).not.toContain(MOCK.password)
})
