import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Previa do tempo ao passar pela barra de progresso, como no YouTube. O filme do mock tem 20 s.
test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

const comDuracao = (page: import('@playwright/test').Page) =>
  page.waitForFunction(() => (document.querySelector('video')?.duration ?? 0) > 0, null, { timeout: 15000 })

test('mouse sobre a barra mostra o tempo daquele ponto', async ({ page }) => {
  await page.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await comDuracao(page)
  const barra = page.getByRole('slider', { name: 'Progresso' })
  const previa = page.getByTestId('previa-tempo')
  await page.mouse.move(200, 300)
  const r = (await barra.boundingBox())!
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await expect(previa).toHaveText(/^0:(09|10|11)$/)
  await page.mouse.move(r.x + r.width * 0.9, r.y + r.height / 2)
  await expect(previa).toHaveText(/^0:1[789]$/)
  await page.mouse.move(r.x + r.width / 2, r.y - 120)
  await expect(previa).toHaveCount(0)
})

test.describe('TV', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })

  test('setas na barra pulam 10 s e mostram o tempo; subir/descer saem dela', async ({ page }) => {
    await page.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
    await comDuracao(page)
    const focado = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
    await page.evaluate(() => document.querySelector('video')!.pause()) // parado, para o tempo so andar pela seta
    await page.keyboard.press('Enter') // foca o Play/Pause
    await page.keyboard.press('ArrowUp')
    expect(await focado()).toBe('Progresso')
    await expect(page.getByTestId('previa-tempo')).toBeVisible()
    const antes = await page.evaluate(() => document.querySelector('video')!.currentTime)
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => page.evaluate(() => document.querySelector('video')!.currentTime)).toBeGreaterThanOrEqual(Math.min(antes + 9, 19))
    expect(await focado()).toBe('Progresso')
    await page.keyboard.press('ArrowDown')
    expect(await focado()).not.toBe('Progresso')
    await expect(page.getByTestId('previa-tempo')).toHaveCount(0)
  })
})
