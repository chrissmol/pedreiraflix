import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

const TELAS = {
  computador: {},
  celular: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
  tv: {
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  },
}

const nome = (page: import('@playwright/test').Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => getComputedStyle(el).animationName)

for (const [tela, cfg] of Object.entries(TELAS)) {
  test.describe(`animacoes ${tela}`, () => {
    test.use(cfg)

    test(`${tela}: aba de Times faz fade ao trocar`, async ({ page }) => {
      await seedSession(page)
      await page.goto('/times')
      await expect(page.getByRole('tabpanel')).toBeVisible()
      expect(await nome(page, '[role=tabpanel]')).toBe('fade-in')
      await page.getByRole('tab', { name: /Campeonatos/ }).click()
      await expect(page.locator('#painel-campeonatos')).toBeVisible()
      expect(await nome(page, '#painel-campeonatos')).toBe('fade-in')
    })

    test(`${tela}: fundo e painel de filtros animam (gaveta no celular, fade na TV)`, async ({ page }) => {
      await seedSession(page)
      await page.goto('/movies')
      const abrir = page.getByRole('button', { name: /Filtros/ }).first()
      await abrir.focus()
      await abrir.press('Enter')
      const painel = page.getByRole('dialog', { name: 'Filtros' })
      await expect(painel).toBeVisible()
      expect(await painel.evaluate((el) => getComputedStyle(el.parentElement!).animationName)).toBe('fade-in')
      const esperado = tela === 'celular' ? 'sheet-up' : tela === 'tv' ? 'fade-in' : 'pop-in'
      expect(await painel.evaluate((el) => getComputedStyle(el).animationName)).toBe(esperado)
    })
  })
}

test.describe('reduzir movimento', () => {
  test.use({ reducedMotion: 'reduce' })
  test('animacoes encurtam para ~0', async ({ page }) => {
    await seedSession(page)
    await page.goto('/times')
    await expect(page.getByRole('tabpanel')).toBeVisible()
    const d = await page.locator('[role=tabpanel]').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration))
    expect(d).toBeLessThan(0.001)
  })
})
