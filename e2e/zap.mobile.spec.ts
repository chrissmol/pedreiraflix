import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

// Dispatched via a real PointerEvent in-page (Playwright's locator.dispatchEvent doesn't reliably
// pass touch pointerType through to React's synthetic handlers) so the vertical-swipe zap gesture
// gets a genuine 'touch' pointerType end to end. `direction: 'up'` drags the finger upward (pointerdown
// below, pointerup above — screen Y decreases), the natural gesture for "swipe up".
async function swipe(page: import('@playwright/test').Page, direction: 'up' | 'down') {
  const box = (await page.locator('video').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const sign = direction === 'up' ? -1 : 1
  await page.evaluate(
    ({ cx, cy, sign }) => {
      const video = document.querySelector('video')!
      const base = { pointerType: 'touch', bubbles: true, cancelable: true, clientX: cx }
      video.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientY: cy - sign * 100 }))
      video.dispatchEvent(new PointerEvent('pointerup', { ...base, clientY: cy + sign * 100 }))
    },
    { cx, cy, sign },
  )
}

test('vertical swipe zaps channels on touch', async ({ page }) => {
  await page.goto('/live')
  await page.getByText('Canal Notícias 24h').click()
  await expect(page).toHaveURL(/\/watch\/live\/101/)
  await expect(page.locator('video')).toBeVisible()
  // The full channel list (for zapping) loads asynchronously after the player mounts.
  await page.getByLabel('Próximo canal').waitFor()

  // Swipe up = next channel.
  await swipe(page, 'up')
  await expect(page).toHaveURL(/\/watch\/live\/102/)

  // Swipe down = previous channel.
  await swipe(page, 'down')
  await expect(page).toHaveURL(/\/watch\/live\/101/)
})
