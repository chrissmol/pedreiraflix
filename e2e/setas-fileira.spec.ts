import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// As setas de rolar da fileira só aparecem quando há para onde rolar.
test('fileira: sem seta quando cabe; direita ao transbordar; esquerda depois de rolar', async ({ page }) => {
  await seedSession(page)
  await page.goto('/movies')
  const dir = page.getByRole('button', { name: /^Rolar ".+" para a direita$/ })
  const esq = page.getByRole('button', { name: /^Rolar ".+" para a esquerda$/ })
  await expect(page.locator('section h2').filter({ hasText: /\S/ }).first()).toBeVisible()
  await expect(dir).toHaveCount(0)
  await expect(esq).toHaveCount(0)

  // Força uma fileira a transbordar (o fixture tem poucos títulos) e avisa o layout.
  await page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find((x) => x.querySelector('h2')?.textContent?.trim() && x.querySelector('.overflow-x-auto'))!
    const el = sec.querySelector('.overflow-x-auto') as HTMLElement
    const spacer = document.createElement('div')
    spacer.style.cssText = 'flex:none;width:3000px'
    el.appendChild(spacer)
    window.dispatchEvent(new Event('resize'))
  })
  await expect(dir).toHaveCount(1)
  await expect(esq).toHaveCount(0)
  await dir.click()
  await expect(esq).toHaveCount(1)
})
