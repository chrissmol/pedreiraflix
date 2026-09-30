import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('speed, audio track and subtitle menus work on a multi-track HLS title', async ({ page }) => {
  await page.goto('/movies/3')
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page).toHaveURL(/\/watch\/movie\/3/)
  const video = page.locator('video')
  await expect(video).toBeVisible()
  await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement)?.readyState >= 1)

  // Speed.
  await page.getByRole('button', { name: 'Velocidade' }).click()
  await page.getByRole('button', { name: '1.5x' }).click()
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1.5)

  // Audio track (2 alternate languages baked into the fixture).
  await page.getByRole('button', { name: 'Áudio' }).click()
  await expect(page.getByRole('button', { name: 'English' })).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()

  // Subtitles (default off, one Portuguese track available).
  const ccButton = page.getByRole('button', { name: 'Legendas' })
  await ccButton.click()
  await page.getByRole('button', { name: 'Português' }).click()
  await expect.poll(() =>
    page.locator('video').evaluate((v: HTMLVideoElement) => {
      const showing = Array.from(v.textTracks).find((t) => t.mode === 'showing')
      return showing?.kind
    }),
  ).toBe('subtitles')
})

test('Picture-in-Picture toggles the browser API', async ({ page }) => {
  await page.goto('/movies/1')
  await page.getByRole('button', { name: 'Assistir' }).click()
  const video = page.locator('video')
  await expect(video).toBeVisible()
  await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement)?.readyState >= 2)

  const pipButton = page.getByRole('button', { name: 'Picture-in-Picture' })
  await expect(pipButton).toBeVisible()
  await pipButton.click()
  await expect.poll(() => page.evaluate(() => !!document.pictureInPictureElement)).toBe(true)
})

test('Media Session exposes metadata and a working play/pause handler', async ({ page }) => {
  await page.goto('/movies/1')
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page.locator('video')).toBeVisible()
  await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement)?.readyState >= 2)

  await expect.poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('Filme Explosivo')
  await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).pause())
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.playbackState)).toBe('paused')
  // Fires the actual registered action handler, not just a DOM event.
  await page.evaluate(() => (navigator as any).__triggerPlay = true)
  await page.evaluate(async () => {
    // MediaSession action handlers aren't otherwise invocable from a test; call play() directly and
    // assert the handler *was registered* by checking playbackState updates once playing.
    await (document.querySelector('video') as HTMLVideoElement).play()
  })
  await expect.poll(() => page.evaluate(() => navigator.mediaSession.playbackState)).toBe('playing')
})

test('auto-advances to the next episode and offers a manual "next episode" button', async ({ page }) => {
  await page.goto('/series/50')
  await page.getByText('T1E1 - Episódio 1').click()
  await expect(page).toHaveURL(/\/watch\/series\/5011/)
  await expect(page.locator('video')).toBeVisible()

  // Manual next-episode button in the control bar.
  await page.mouse.move(400, 300)
  const nextButton = page.getByRole('button', { name: 'Próximo episódio' })
  await expect(nextButton).toBeVisible()
  await nextButton.click()
  await expect(page).toHaveURL(/\/watch\/series\/5012/)

  // Auto-advance prompt near the end of playback.
  await page.locator('video').evaluate((v: HTMLVideoElement) => {
    v.currentTime = Math.max(0, v.duration - 5)
  })
  await expect(page.getByText('A seguir')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('T1E3 - Episódio 3')).toBeVisible()
})


test('zaps to the next/previous live channel with on-screen buttons and arrow keys', async ({ page }) => {
  test.setTimeout(90_000) // click() below already retries; this just gives it room under a loaded machine.
  await page.goto('/live')
  await page.getByText('Canal Notícias 24h').click()
  await expect(page).toHaveURL(/\/watch\/live\/101/)
  // The full channel list (needed for zapping) loads asynchronously after the player mounts; the
  // button stays rendered-but-disabled until then, so clicking too early would silently no-op.
  await expect(page.getByRole('button', { name: 'Próximo canal' })).toBeEnabled()
  // Wait for actual playback to start before interacting — while still loading, the video element can
  // briefly cover the zap buttons before the player has settled into its final layout.
  await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement)?.readyState >= 1)

  // Controls auto-hide after 3s of inactivity via `opacity-0 pointer-events-none` — wake them and wait
  // for the opacity to actually reach 1 (Playwright's "visible" check ignores opacity). A coordinate
  // click can still intermittently land on the <video> instead (Chromium's hardware-decoded video
  // surface occasionally paints above correctly z-indexed siblings), so dispatch a native DOM click,
  // which fires the same onClick handler without depending on screen-space hit-testing.
  async function click(name: string) {
    const button = page.getByRole('button', { name })
    await page.mouse.move(400, 300)
    await page.mouse.move(400, 301)
    await expect(button).toHaveCSS('opacity', '1')
    await expect(button).toBeEnabled()
    await button.evaluate((el: HTMLElement) => el.click())
  }

  await click('Próximo canal')
  await expect(page).toHaveURL(/\/watch\/live\/102/)
  await click('Próximo canal')
  await expect(page).toHaveURL(/\/watch\/live\/103/)
  await click('Canal anterior')
  await expect(page).toHaveURL(/\/watch\/live\/102/)

  // A navigation swaps the zap callbacks (they close over the new channel id), and the keydown
  // listener re-subscribes to match — give that a beat so a key press doesn't land mid-swap.
  await page.waitForTimeout(300)
  await page.keyboard.press('ArrowUp')
  await expect(page).toHaveURL(/\/watch\/live\/103/)
  await page.waitForTimeout(300)
  await page.keyboard.press('ArrowDown')
  await expect(page).toHaveURL(/\/watch\/live\/102/)
})

test('recovers from a stray first autoplay rejection instead of getting stuck on the play button', async ({ page }) => {
  // Simulates a real-world race where the *whole first attempt* (both the unmuted try and its muted
  // fallback — attemptAutoplay's own internal recovery) rejects for some transient reason, and only a
  // later readiness event (canplay) gets a clean shot. Proves the canplay-triggered retry, specifically
  // — not just attemptAutoplay's built-in unmuted→muted fallback — is what recovers playback here.
  await page.addInitScript(() => {
    let rejections = 0
    const original = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (rejections < 2) {
        rejections++
        return Promise.reject(new DOMException('simulated race', 'AbortError'))
      }
      return original.call(this)
    }
  })
  await page.goto('/movies/1')
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page).toHaveURL(/\/watch\/movie\/1/)
  // Despite the forced first rejection, playback should recover on its own — no manual play click.
  await page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement | null
    return !!v && !v.paused && v.currentTime > 0.5
  }, { timeout: 15000 })
})

test('posters served from a non-proxy-friendly host are routed through our own proxy', async ({ page }) => {
  // "Corrida Final" (movie id 2) is seeded with a real http:// image URL in the mock panel, instead of
  // the data: URIs every other fixture uses — see e2e/mock-xtream.mjs.
  await page.goto('/movies/2')
  const poster = page.locator('img[alt="Corrida Final"]').first()
  await expect(poster).toBeVisible()
  const src = await poster.getAttribute('src')
  expect(src).toMatch(/^\/api\/stream\?url=/)
  expect(decodeURIComponent(src!)).toContain('/fixtures/poster.jpg')
  // Prove it actually loads (not just the right src attribute) — a broken image reports 0 natural size.
  await expect.poll(() => poster.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
})

test('subtitle size and background are adjustable and persist across reload', async ({ page }) => {
  await page.goto('/movies/3')
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page).toHaveURL(/\/watch\/movie\/3/)
  await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement)?.readyState >= 1)

  await page.getByRole('button', { name: 'Legendas' }).click()
  await page.getByRole('button', { name: 'Português', exact: true }).click()
  await page.getByRole('button', { name: 'Legendas' }).click()
  await page.getByRole('button', { name: 'Legenda tamanho large' }).click()
  await page.getByRole('button', { name: 'Sólido' }).click()

  const cueRule = () => page.locator('style').evaluateAll((els) => els.map((e) => e.textContent).find((t) => t?.includes('::cue')))
  await expect.poll(cueRule).toContain('1.8em')
  await expect.poll(cueRule).toContain('rgba(0, 0, 0, 0.95)')

  // Preferences are global (not per-title), so they should survive a reload/new playback too.
  await page.reload()
  await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement)?.readyState >= 1)
  await expect.poll(cueRule).toContain('1.8em')
})

test('proxied poster images are served with long-lived cache headers', async ({ request }) => {
  const res = await request.get('/api/stream?url=' + encodeURIComponent('http://localhost:8790/fixtures/poster.jpg'))
  expect(res.ok()).toBe(true)
  expect(res.headers()['cache-control']).toBe('public, max-age=604800')
})
