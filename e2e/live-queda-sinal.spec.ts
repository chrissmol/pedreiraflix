import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Android TV (emulador, 26/10): depois de uma queda de sinal de ~35 s o hls.js desiste e o canal ficava parado em
// "Sinal instavel" mesmo com a internet de volta, ate alguem apertar "Tentar novamente" no controle.
test('ao vivo: depois de desistir por queda de sinal, tenta sozinho de novo e volta a tocar', async ({ page }) => {
  await seedSession(page)
  await page.clock.install()
  let offline = false
  await page.route('**/api/stream*', (route) => (offline ? route.abort() : route.continue()))
  await page.goto('/watch/live/101?name=Canal%20Not%C3%ADcias%2024h')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(2)

  offline = true
  const erro = page.getByText(/Sinal instável/)
  for (let i = 0; i < 40 && !(await erro.isVisible()); i++) {
    await page.clock.runFor(10_000)
    await page.waitForTimeout(300)
  }
  await expect(erro).toBeVisible()

  offline = false
  for (let i = 0; i < 10 && (await erro.isVisible()); i++) {
    await page.clock.runFor(10_000)
    await page.waitForTimeout(500)
  }
  await expect(erro).toBeHidden()
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(2)
})
