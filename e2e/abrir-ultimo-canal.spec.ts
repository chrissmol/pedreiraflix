import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Fire TV (user agent "AFT"), 960x540: so setas e OK.
test.use({
  userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
  viewport: { width: 960, height: 540 },
})

test('TV: com "Abrir no último canal" ligado, abrir o app cai no último canal; desligado, no Início', async ({ page }) => {
  await seedSession(page)
  await page.goto('/profiles') // cria o perfil antes do canal, para o recente ficar nele
  await page.getByTestId(/^profile-card-/).first().getByRole('button', { name: 'Ajustes' }).click()
  await page.getByRole('switch', { name: 'Abrir no último canal' }).check()
  await page.goto('/watch/live/102?name=Canal%20Economia') // vira o ultimo canal
  await expect.poll(() => page.evaluate(() => localStorage.getItem('iptv-library')?.includes('"recentLive":{"') ?? false)).toBe(true)
  await page.goto('/') // recarrega = app aberto de novo
  await expect(page).toHaveURL(/\/watch\/live\/102/)
})

test.describe('fora da TV', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', viewport: { width: 1280, height: 800 } })
  test('o ajuste nem aparece', async ({ page }) => {
    await seedSession(page)
    await page.goto('/profiles')
    await page.getByTestId(/^profile-card-/).first().getByRole('button', { name: 'Ajustes' }).click()
    await expect(page.getByRole('switch', { name: 'Perfil infantil' })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Abrir no último canal' })).toHaveCount(0)
  })
})

test('TV: desligado (padrao), abrir o app fica no Início', async ({ page }) => {
  await seedSession(page)
  await page.goto('/profiles')
  await page.goto('/watch/live/102?name=Canal%20Economia')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('iptv-library')?.includes('102') ?? false)).toBe(true)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Conta', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})
