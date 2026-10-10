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

// Todas as telas ficam guardadas ja na instalacao: sem internet, a tela de Downloads abre mesmo sem nunca ter
// sido aberta com internet (o filme baixado no APK tem que ter onde ser assistido, 08/10).
test('sem internet, uma tela nunca aberta (Downloads) abre do cache', async ({ page, context }) => {
  await page.addInitScript((creds) => {
    if (localStorage.getItem('iptv-session')) return
    const user = { username: creds.username, status: 'Active', expDate: null, isTrial: false, activeConnections: '0', maxConnections: '2' }
    const server = { url: 'localhost', serverName: 'Mock Panel', timezone: 'America/Sao_Paulo' }
    localStorage.setItem('iptv-session', JSON.stringify({ state: { credentials: creds, user, server, sessionWarning: null }, version: 0 }))
  }, MOCK)
  await page.goto('/profiles')
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await page.waitForFunction(async () => (await caches.keys()).length > 0 && (await (await caches.open((await caches.keys())[0])).keys()).some((r) => r.url.includes('DownloadsPage')))
  await context.setOffline(true)
  try {
    await page.goto('/downloads')
    await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})

// Cada deploy troca os nomes de /assets/*; os antigos ficavam no cache para sempre (so a troca de VERSION limpava).
test('ao ativar uma versao nova, os arquivos antigos de /assets/ saem do cache', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => !!navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true))
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await page.evaluate(async () => {
    const [name] = (await caches.keys()).filter((k) => k.startsWith('pedreiraflix-'))
    await (await caches.open(name)).put('/assets/antigo-deploy-abc123.js', new Response('//velho'))
    for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister()
  })
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const [name] = (await caches.keys()).filter((k) => k.startsWith('pedreiraflix-'))
        const urls = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname)
        return { velho: urls.includes('/assets/antigo-deploy-abc123.js'), atuais: urls.filter((u) => u.startsWith('/assets/')).length }
      }),
    )
    .toMatchObject({ velho: false })
})
