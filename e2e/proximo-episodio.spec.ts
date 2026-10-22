import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

// Pausa e pula para perto do fim sem deixar o video acabar (o "ended" trocaria de episodio sozinho). O progresso
// so e gravado de 5 em 5s, por isso a espera antes do pulo.
async function stopNearEnd(page: Page, secondsLeft: number) {
  await page.locator('video').evaluate(async (v: HTMLVideoElement) => {
    while (!Number.isFinite(v.duration)) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }))
    v.pause()
  })
  await page.waitForTimeout(5500)
  await page.locator('video').evaluate((v: HTMLVideoElement, left) => (v.currentTime = v.duration - left), secondsLeft)
}

test('episodio terminado nos creditos poe o proximo em "Continuar assistindo"', async ({ page }) => {
  await page.goto('/series/50')
  await page.getByText('T1E1 - Episódio 1').click()
  await expect(page).toHaveURL(/\/watch\/series\/5011/)
  // 1,5s antes do fim de um video de 20s: dentro dos creditos (10%), antes dos 95%.
  await stopNearEnd(page, 1.5)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('iptv-library') ?? '')).toContain('T1E2 - Episódio 2')

  await page.goto('/')
  const card = page.getByRole('button', { name: /Série Dramática - T1E2 - Episódio 2/ })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Próximo episódio')
  await expect(page.getByRole('button', { name: /T1E1 - Episódio 1/ })).toHaveCount(0)
})

test('filme parado nos creditos sai de "Continuar assistindo"', async ({ page }) => {
  await page.goto('/movies/1')
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page).toHaveURL(/\/watch\/movie\/1/)
  await stopNearEnd(page, 1.5)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('iptv-library') ?? '')).toContain('"watched":{"')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Continuar assistindo' })).toHaveCount(0)
})
