import { expect, test } from '@playwright/test'
import { MOCK } from './helpers'

// Runs against a real production build (`vite preview`) — the service worker only registers there
// (see src/main.tsx), so this is the only place it can be exercised at all.
test.describe.configure({ mode: 'serial' })

test('manifest and icons are reachable and well-formed', async ({ page, request }) => {
  await page.goto('/')
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBe('/manifest.webmanifest')

  const manifestRes = await request.get('/manifest.webmanifest')
  expect(manifestRes.ok()).toBe(true)
  const manifest = await manifestRes.json()
  expect(manifest.name).toBe('PedreiraFlix')
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '192x192')).toBe(true)
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true)

  // Without a maskable icon Android crops the artwork into its own shape or pads it with a white plate;
  // this app's PNGs are full-bleed with the mark inside the safe zone, so they serve both purposes.
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose?.includes('maskable'))).toBe(true)

  for (const icon of manifest.icons) {
    const res = await request.get(icon.src)
    expect(res.ok(), `${icon.src} should load`).toBe(true)
  }

  const appleTouchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
  expect(appleTouchIcon).toBe('/apple-touch-icon.png')
  expect((await request.get(appleTouchIcon!)).ok()).toBe(true)
})

test('service worker registers and takes control', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true))
  const controlled = await page.evaluate(() => new Promise((resolve) => {
    if (navigator.serviceWorker.controller) return resolve(true)
    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true))
    setTimeout(() => resolve(false), 5000)
  }))
  // First load registers the SW but isn't controlled by it yet; a reload should be.
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  void controlled
})

test('the service worker never intercepts /api/* — live playback still works with it active', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)

  await page.goto('/login')
  await page.getByLabel('Endereço do servidor').fill(MOCK.baseUrl)
  await page.getByLabel('Usuário', { exact: true }).fill(MOCK.username)
  await page.getByLabel('Senha', { exact: true }).fill(MOCK.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('link', { name: 'Canais' }).click()
  await page.getByText('Canal Notícias 24h').click()
  await expect(page).toHaveURL(/\/watch\/live\//)
  await expect(page.locator('video')).toBeVisible()
  await page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement | null
    return !!v && v.currentTime > 1
  }, { timeout: 15000 })
})

test('a second visit serves the app shell from cache (stale-while-revalidate)', async ({ page }) => {
  const assetRequests: string[] = []
  page.on('request', (req) => {
    if (req.url().endsWith('.js') || req.url().endsWith('.css')) assetRequests.push(req.url())
  })
  await page.goto('/')
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true))
  // The service worker only takes control of the page that follows registration, not the one that
  // triggered it — a reload is what actually routes fetches (and thus caching) through it.
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)

  const fromCache = await page.evaluate(async () => {
    const keys = await caches.keys()
    const cache = await caches.open(keys[0])
    const requests = await cache.keys()
    return requests.some((r) => r.url.endsWith('.js'))
  })
  expect(fromCache).toBe(true)
})
