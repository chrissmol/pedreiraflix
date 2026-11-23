import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.use({ hasTouch: true })

// Notebook com tela de toque: depois de um toque, mexer o mouse tem de mostrar os controles de novo.
test('mouse move shows the player controls, even after a touch tap earlier', async ({ page }) => {
  await seedSession(page)
  await page.goto('/watch/movie/1')
  const video = page.locator('video')
  await expect(video).toBeVisible()
  await page.waitForFunction(() => { const v = document.querySelector('video'); return !!v && !v.paused && v.currentTime > 0 }, null, { timeout: 15_000 })
  await page.touchscreen.tap(600, 300) // single tap: waits out the double-tap window, then toggles
  await page.waitForTimeout(500)
  await page.mouse.move(100, 100)
  await page.waitForTimeout(4000)
  await expect(page.locator('.cursor-none')).toHaveCount(1) // controles sumiram
  await page.mouse.move(300, 300)
  await page.mouse.move(350, 320)
  await expect(page.locator('.cursor-none')).toHaveCount(0)
  await page.waitForTimeout(3500)
  await expect(page.locator('.cursor-none')).toHaveCount(1) // somem sozinhos de novo
})
