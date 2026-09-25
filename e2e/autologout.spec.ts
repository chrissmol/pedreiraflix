import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => {
  // 1.5s "inactivity" timeout for this test instead of the real 2h.
  await page.addInitScript(() => {
    ;(window as any).__AUTO_LOGOUT_MS_OVERRIDE__ = 1500
  })
})

test('logs out after prolonged inactivity', async ({ page }) => {
  await login(page)
  await expect(page).toHaveURL(/\/$/)
  // No interaction at all for longer than the (overridden) timeout.
  await page.waitForTimeout(2500)
  await expect(page).toHaveURL(/\/login$/)
})

test('does not log out while actively interacting', async ({ page }) => {
  await login(page)
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    // A real click/tap (pointerdown), not just a mouse move — mousemove is deliberately not treated as
    // activity (see components/AutoLogout.tsx), the same way most apps' inactivity timers ignore it too.
    await page.mouse.click(10, 10)
    await page.waitForTimeout(400)
  }
  await expect(page).toHaveURL(/\/$/) // still logged in — activity kept resetting the timer
})

test('does not log out mid-playback even with zero pointer/keyboard activity', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Filmes' }).click()
  await expect(page.getByRole('heading', { name: 'Filmes', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Filme Explosivo Filme' }).click()
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page).toHaveURL(/\/watch\/movie\//)
  await page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement | null
    return !!v && v.currentTime > 0.5
  })
  // Long past the overridden timeout, with no mouse/keyboard activity at all — just letting it play.
  await page.waitForTimeout(2500)
  await expect(page).toHaveURL(/\/watch\/movie\//) // not bounced to /login
})
