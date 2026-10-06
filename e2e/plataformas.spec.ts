import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('a estrela de favoritar aparece sem precisar de hover no mouse', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await login(page)
  await page.goto('/live')
  // Sem mover o mouse para cima do canal: o botão tem de estar visível por si.
  await expect(page.getByRole('button', { name: 'Favoritar Canal Clima' })).toBeVisible()
})

test('a lista de canais usa mais colunas em tela grande', async ({ page }) => {
  await login(page)
  const columns = () =>
    page
      .locator('#main-content .grid')
      .first()
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)

  // Grade automatica em vez de breakpoints: a largura do cartao e que manda, entao toda tela recebe
  // quantas colunas couberem. Antes travava em 3 e no monitor grande sobrava metade da tela vazia.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/live')
  await expect(page.getByText('Canal Clima')).toBeVisible()
  expect(await columns()).toBe(1)

  await page.setViewportSize({ width: 1366, height: 768 })
  const noNotebook = await columns()
  expect(noNotebook).toBeGreaterThanOrEqual(3)

  await page.setViewportSize({ width: 2560, height: 1080 })
  await expect.poll(columns).toBeGreaterThan(noNotebook)
})

test('a cor da moldura do sistema acompanha o tema', async ({ page }) => {
  await login(page)
  const themeColor = () => page.locator('meta[name="theme-color"]').getAttribute('content')
  expect(await themeColor()).toBe('#06070c')

  await page.getByRole('button', { name: /Conta|Perfil|D/ }).first().click()
  await page.getByRole('button', { name: /Tema claro/ }).click()
  await expect.poll(themeColor).toBe('#f7f8fb')
})
