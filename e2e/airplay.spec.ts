import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Safari responde 'maybe' para o MIME de HLS em varias versoes. O app exigia 'probably', caia no hls.js
// e o AirPlay passava a mandar so audio — a TV ficava preta no ao vivo.
test('num navegador WebKit o HLS toca nativamente, mesmo com canPlayType "maybe"', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = HTMLMediaElement.prototype as unknown as Record<string, unknown>
    proto.canPlayType = function () {
      return 'maybe'
    }
    proto.webkitShowPlaybackTargetPicker = function () {}
  })

  await login(page)
  await page.goto('/watch/live/101?name=Canal')
  await expect(page.locator('video')).toBeVisible()

  // HLS nativo: o <video> recebe a lista direto, sem o blob: do MediaSource do hls.js.
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.src)).toMatch(/\.m3u8/)
})

test('no HLS nativo o menu de audio vem das faixas do proprio Safari', async ({ page }) => {
  await page.addInitScript(() => {
    const proto = HTMLMediaElement.prototype as unknown as Record<string, unknown>
    proto.canPlayType = function () {
      return 'maybe'
    }
    proto.webkitShowPlaybackTargetPicker = function () {}
    const list = Object.assign(new EventTarget(), {
      length: 2,
      0: { label: 'Português', language: 'pt', enabled: true },
      1: { label: 'English', language: 'en', enabled: false },
    })
    ;(window as unknown as Record<string, unknown>).__audio = list
    Object.defineProperty(HTMLMediaElement.prototype, 'audioTracks', { get: () => list })
  })

  await login(page)
  await page.goto('/watch/live/101?name=Canal')
  await page.mouse.move(300, 300)
  await page.mouse.move(400, 300)
  await page.getByRole('button', { name: 'Áudio' }).click()
  await page.getByRole('button', { name: 'English' }).click()
  const enabled = await page.evaluate(() => {
    const l = (window as unknown as { __audio: Record<number, { enabled: boolean }> }).__audio
    return [l[0].enabled, l[1].enabled]
  })
  expect(enabled).toEqual([false, true])
})

test('sem as APIs do WebKit, um "maybe" continua caindo no hls.js', async ({ page }) => {
  await page.addInitScript(() => {
    ;(HTMLMediaElement.prototype as unknown as Record<string, unknown>).canPlayType = function () {
      return 'maybe'
    }
  })

  await login(page)
  await page.goto('/watch/live/101?name=Canal')
  await expect(page.locator('video')).toBeVisible()
  await expect(page.getByRole('button', { name: /Rápido/ })).toBeVisible()
})
