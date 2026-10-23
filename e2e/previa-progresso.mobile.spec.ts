import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('arrastar o dedo na barra mostra o tempo e some ao soltar', async ({ page }) => {
  await page.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await page.waitForFunction(() => (document.querySelector('video')?.duration ?? 0) > 0, null, { timeout: 15000 })
  await page.touchscreen.tap(200, 300) // mostra os controles
  const barra = page.getByRole('slider', { name: 'Progresso' })
  await expect(barra).toBeVisible()
  const r = (await barra.boundingBox())!
  const y = r.y + r.height / 2
  // Toque de verdade (CDP), para o navegador arrastar o slider como no celular.
  const cdp = await page.context().newCDPSession(page)
  const toque = (type: string, x: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  await toque('touchStart', r.x + r.width * 0.2)
  await toque('touchMove', r.x + r.width * 0.5)
  await toque('touchMove', r.x + r.width * 0.75)
  const previa = page.getByTestId('previa-tempo')
  await expect(previa).toHaveText(/^0:1[4-6]$/)
  await toque('touchEnd', 0)
  await expect(previa).toHaveCount(0)
})
