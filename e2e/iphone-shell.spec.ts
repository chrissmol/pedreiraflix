import { expect, test } from '@playwright/test'
import { login } from './helpers'

// O video no iPhone instalado mostrou o menu flutuante no meio da tela, com conteudo por baixo: o shell
// usava 100dvh, que o WebKit em standalone calcula menor que a area visivel real.
test('o shell tem a altura real da janela, nao a calculada por dvh', async ({ page }) => {
  await login(page)
  const shell = page.locator('#main-content').locator('xpath=..')

  for (const height of [844, 915, 700]) {
    await page.setViewportSize({ width: 390, height })
    await expect
      .poll(() => shell.evaluate((el) => el.getBoundingClientRect().height))
      .toBe(height)
  }
})

test('a tela nao rola para os lados', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)

  for (const path of ['/', '/live', '/movies']) {
    await page.goto(path)
    await page.waitForTimeout(1200)
    const overflow = await page
      .locator('#main-content')
      .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
    expect(overflow.scroll, `${path} nao deve ter conteudo alem da largura`).toBeLessThanOrEqual(overflow.client)
  }
})
