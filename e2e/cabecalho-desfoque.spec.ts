import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Cabeçalho tem desfoque fixo (não depende da rolagem) no computador e no celular.
test('cabeçalho: desfoque fixo antes e depois de rolar', async ({ page }) => {
  await seedSession(page)
  await page.goto('/')
  const blur = () => page.locator('header.header-blur').evaluate((el) => getComputedStyle(el, '::before').backdropFilter)
  await expect.poll(blur).toContain('blur')
  await page.mouse.wheel(0, 800)
  await expect.poll(blur).toContain('blur')
})
