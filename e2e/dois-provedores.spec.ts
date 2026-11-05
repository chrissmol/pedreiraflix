import { expect, test, type Page } from '@playwright/test'
import { MOCK } from './helpers'

// O localStorage do app e ofuscado (XOR, lib/obfuscatedStorage.ts): le de volta o JSON de verdade.
const lerStore = (page: Page, key: string) =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    if (!raw) return ''
    const bin = atob(raw)
    const KEY = 'pedreiraflix-v1'
    return new TextDecoder().decode(Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ KEY.charCodeAt(i % KEY.length)))
  }, key)

const PLAYLIST_URL = `${MOCK.baseUrl}/playlist.m3u`

test('painel em subpasta: o login guarda a subpasta e o catalogo e o video vem dela', async ({ page }) => {
  await page.goto('/login')
  const other = page.getByRole('button', { name: '+ Usar outra conta' })
  if (await other.isVisible().catch(() => false)) await other.click()
  // Link inteiro colado, como o provedor manda: a subpasta fica, o arquivo get.php sai.
  await page.getByLabel('Endereço do servidor').fill(`${MOCK.baseUrl}/painel/get.php?username=${MOCK.username}&password=${MOCK.password}`)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByLabel('Endereço do servidor')).toHaveCount(0)
  expect(await lerStore(page, 'iptv-session')).toContain('"baseUrl":"http://localhost:8790/painel"')

  await page.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await expect(page.locator('video')).toBeVisible()
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)
  expect(((await (await page.request.get(`${MOCK.baseUrl}/__requests`)).json()) as string[]).some((u) => u.startsWith('/painel/movie/'))).toBe(true)
})

test('playlist M3U sai do localStorage (IndexedDB) e a conta volta apos recarregar', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Link M3U' }).click()
  await page.getByLabel('Link da playlist M3U').fill(PLAYLIST_URL)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  // A playlist so some do localStorage depois que o IndexedDB confirma.
  await expect
    .poll(async () => (await lerStore(page, 'iptv-session')).includes('Canal M3U Teste'))
    .toBe(false)
  expect(await lerStore(page, 'iptv-accounts')).not.toContain('Canal M3U Teste')
  expect(await lerStore(page, 'iptv-session')).toContain('"credentials"')

  await page.reload()
  await page.goto('/live')
  await expect(page.getByText('Canal M3U Teste').first()).toBeVisible()
})

test('migracao: playlist que ja estava no localStorage passa para o IndexedDB sem perder a conta', async ({ page }) => {
  await page.goto('/login')
  const body = await (await page.request.get(PLAYLIST_URL)).text()
  const entries = await page.evaluate(async (text) => {
    const mod = await import('/src/lib/m3u.ts')
    return mod.parseM3u(text)
  }, body)
  const creds = { type: 'm3u', source: 'url', url: PLAYLIST_URL }
  const user = { username: 'm3u', status: 'Active', expDate: null, isTrial: false, activeConnections: '', maxConnections: '' }
  await page.evaluate(
    ([c, u, e, url]) => {
      localStorage.setItem('iptv-session', JSON.stringify({ state: { credentials: c, entries: e, user: u, server: { url: '', serverName: '', timezone: '' }, sessionWarning: null }, version: 1 }))
      localStorage.setItem('iptv-accounts', JSON.stringify({ state: { accounts: [{ id: `m3u-url|${url.toLowerCase()}`, lastUsedAt: 1, credentials: c, entries: e }] }, version: 1 }))
    },
    [creds, user, entries, PLAYLIST_URL] as const,
  )
  await page.goto('/live')
  await expect(page.getByText('Canal M3U Teste').first()).toBeVisible()
  await expect
    .poll(async () => (await lerStore(page, 'iptv-session')).includes('Canal M3U Teste'))
    .toBe(false)
  await page.reload()
  await page.goto('/live')
  await expect(page.getByText('Canal M3U Teste').first()).toBeVisible()
})
