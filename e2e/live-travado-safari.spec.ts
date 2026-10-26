import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Safari toca o ao vivo por HLS nativo e nao tem o retry do hls.js: travado em "carregando" ele ficava assim para
// sempre (iPhone do Christian, 26/10). O Chromium nao tem HLS nativo, entao o teste finge o Safari (canPlayType) e
// conta quantas vezes o player solta e recarrega a fonte.
test('Safari (HLS nativo): canal ao vivo travado e recarregado, no maximo 3 vezes seguidas', async ({ page }) => {
  await page.addInitScript(() => {
    const canPlay = HTMLMediaElement.prototype.canPlayType
    HTMLMediaElement.prototype.canPlayType = function (t: string) {
      return /mpegurl/i.test(t) ? 'probably' : canPlay.call(this, t)
    }
    const w = window as unknown as { __loads: number }
    w.__loads = 0
    const load = HTMLMediaElement.prototype.load
    HTMLMediaElement.prototype.load = function () {
      w.__loads += 1
      return load.call(this)
    }
  })
  await seedSession(page)
  await page.clock.install()
  await page.goto('/watch/live/101?name=Teste')
  const video = page.locator('video')
  await expect(video).toBeAttached()
  await page.waitForTimeout(1500)
  await page.route('**/api/stream*', (r) => r.abort()) // o provedor engasgou: nada mais toca, so trava
  const loads = () => page.evaluate(() => (window as unknown as { __loads: number }).__loads)
  const antes = await loads()

  const travar = async () => {
    await video.evaluate((v) => v.dispatchEvent(new Event('waiting')))
    await page.clock.runFor(16_000)
    await page.waitForTimeout(400) // o React aplica o setState depois do timer
  }
  await travar()
  expect(await loads()).toBeGreaterThan(antes)
  const depoisDe1 = await loads()
  await travar()
  await travar()
  const depoisDe3 = await loads()
  expect(depoisDe3).toBeGreaterThan(depoisDe1)
  await travar()
  expect(await loads()).toBe(depoisDe3) // 4a travada seguida: desiste, nao fica recarregando para sempre
})
