import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Player na TV como nos apps de streaming: o OK pausa na hora, as setas pulam 10 s e nao ha botoes que so servem no site.
test.use({
  userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
  viewport: { width: 960, height: 540 },
})

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('TV: no filme o OK pausa na hora, o OK seguinte retoma e as setas pulam 10 s', async ({ page }) => {
  await page.goto('/movies/1')
  await page.getByRole('button', { name: 'Assistir' }).click()
  const video = page.locator('video')
  const pausado = () => video.evaluate((v: HTMLVideoElement) => v.paused)
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.5)).toBe(true)

  const t = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
  await page.keyboard.press('ArrowRight') // sem nada focado: pula, nao anda entre botoes
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(t + 5)

  await page.keyboard.press('Enter')
  await expect.poll(pausado).toBe(true) // antes o primeiro OK so mostrava os controles
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Play/Pause')
  await page.keyboard.press('Enter')
  await expect.poll(pausado).toBe(false)
})

test('TV: o player nao mostra tela cheia nem PiP; fora do app instalado pede tela cheia ao entrar', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __fs: number }
    w.__fs = 0
    Element.prototype.requestFullscreen = function () { w.__fs++; return Promise.resolve() }
  })
  await page.goto('/watch/movie/1?ext=mp4&name=Filme')
  await expect(page.getByRole('button', { name: 'Play/Pause' }).first()).toBeAttached()
  expect(await page.evaluate(() => (window as unknown as { __fs: number }).__fs)).toBeGreaterThan(0)
  await page.keyboard.press('ArrowDown') // mostra os controles
  await expect(page.getByLabel('Progresso')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tela cheia' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Picture-in-Picture' })).toHaveCount(0)
})
