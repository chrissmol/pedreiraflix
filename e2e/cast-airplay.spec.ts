import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('AirPlay button appears on a mocked Safari and opens the native picker', async ({ page }) => {
  // Simulates Safari's <video> AirPlay members, which no other engine has, before the app boots.
  await page.addInitScript(() => {
    ;(window as any).__airPlayPickerCalls = 0
    const proto = HTMLVideoElement.prototype as any
    proto.webkitShowPlaybackTargetPicker = function () {
      ;(window as any).__airPlayPickerCalls++
    }
  })
  await login(page)
  await page.goto('/movies/1')
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page.locator('video')).toBeVisible()
  await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement)?.readyState >= 1)

  const airplayButton = page.getByRole('button', { name: 'AirPlay' })
  await expect(airplayButton).toBeVisible()
  await airplayButton.click()
  expect(await page.evaluate(() => (window as any).__airPlayPickerCalls)).toBe(1)
})

test('the Cast (Chromecast) button appears, opens a session and loads media with the right URL/type', async ({ page }) => {
  // Serves a fake Cast sender SDK instead of hitting www.gstatic.com — this cannot verify a real
  // Chromecast receives/plays anything (no hardware available here), but it does prove our code drives
  // the documented Cast Application Framework API correctly: session request, then loadMedia with an
  // absolute, publicly-shaped URL and a sane content type.
  await page.route('https://www.gstatic.com/cv/js/sender/v1/cast_sender.js**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.__castLoadMediaCalls = [];
        window.__castRequestSessionCalls = 0;
        function FakeSession() {}
        FakeSession.prototype.loadMedia = function (req) {
          window.__castLoadMediaCalls.push({ url: req.media.url, contentType: req.media.contentType, title: req.media.metadata && req.media.metadata.title });
          return Promise.resolve();
        };
        var session = null;
        window.chrome = window.chrome || {};
        window.chrome.cast = {
          isAvailable: true,
          media: {
            DEFAULT_MEDIA_RECEIVER_APP_ID: 'CC1AD845',
            MediaInfo: function (url, contentType) { this.url = url; this.contentType = contentType; this.metadata = null; },
            GenericMediaMetadata: function () { this.title = ''; this.images = []; },
            LoadRequest: function (mediaInfo) { this.media = mediaInfo; },
          },
          Image: function (url) { this.url = url; },
          AutoJoinPolicy: { ORIGIN_SCOPED: 'origin_scoped' },
        };
        window.cast = {
          framework: {
            CastContext: {
              getInstance: function () {
                return {
                  setOptions: function () {},
                  getCurrentSession: function () { return session; },
                  requestSession: function () {
                    window.__castRequestSessionCalls++;
                    session = new FakeSession();
                    return Promise.resolve();
                  },
                };
              },
            },
            CastContextEventType: { CAST_STATE_CHANGED: 'caststatechanged' },
            CastState: { NO_DEVICES_AVAILABLE: 'no_devices_available' },
          },
        };
        if (window.__onGCastApiAvailable) window.__onGCastApiAvailable(true);
      `,
    }),
  )
  await page.addInitScript(() => {
    // The SDK script itself calls this on load; our page also defines it before injecting the script,
    // so this stub only matters if the fake script above runs before that assignment lands.
    ;(window as any).chrome = (window as any).chrome || {}
  })

  await login(page)
  await page.goto('/movies/1')
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page.locator('video')).toBeVisible()
  await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement)?.readyState >= 1)

  const castButton = page.getByRole('button', { name: 'Transmitir (Chromecast)' })
  await expect(castButton).toBeVisible({ timeout: 10000 })
  await castButton.click()

  await expect.poll(() => page.evaluate(() => (window as any).__castRequestSessionCalls)).toBe(1)
  const calls = await page.evaluate(() => (window as any).__castLoadMediaCalls)
  expect(calls).toHaveLength(1)
  expect(calls[0].url).toMatch(/^http:\/\/localhost:5173\/api\/stream\?url=/)
  expect(calls[0].contentType).toBe('video/mp4')
  expect(calls[0].title).toBe('Filme Explosivo')
})
