import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// A Inter vinha do Google Fonts: CSS de terceiro bloqueando a pintura e quebrando offline (APK/Windows/PWA).
// Agora e um arquivo do proprio app.
test('a fonte Inter carrega do proprio app, sem pedir nada ao Google', async ({ page }) => {
  const externos: string[] = []
  page.on('request', (req) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(req.url())) externos.push(req.url())
  })
  await seedSession(page)
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Filmes' }).first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const carregou = await page.evaluate(async () => {
    await document.fonts.load('600 16px Inter')
    return [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Inter' && f.status === 'loaded')
  })
  expect(carregou).toBe(true)
  expect(externos).toEqual([])
})
