import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Fire TV (user agent "AFT"), tela de 960x540 CSS como o Fire TV Stick em 1080p: so setas e OK.
test.use({
  userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
  viewport: { width: 960, height: 540 },
})

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('TV: letras maiores e o cabecalho cabe na tela', async ({ page }) => {
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.classList.contains('tv'))).toBe(true)
  const avatar = (await page.getByRole('button', { name: 'Conta', exact: true }).boundingBox())!
  expect(avatar.x + avatar.width).toBeLessThanOrEqual(960)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(960)
})

test('TV: so com as setas da para chegar nos posteres, no cabecalho e abrir um filme', async ({ page }) => {
  await page.goto('/movies')
  await expect(page.getByRole('heading', { name: 'Ação' })).toBeVisible()
  const focado = () => page.evaluate(() => (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').trim().slice(0, 40))

  await page.keyboard.press('ArrowDown') // primeira seta: o foco entra no conteudo
  expect(await page.evaluate(() => !!document.activeElement?.closest('#main-content'))).toBe(true)

  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowUp') // sobe ate o cabecalho
  expect(await page.evaluate(() => !!document.activeElement?.closest('header'))).toBe(true)

  for (let i = 0; i < 12 && !/Filme Explosivo/.test(await focado()); i++) await page.keyboard.press('ArrowDown')
  for (let i = 0; i < 6 && !/Filme Explosivo/.test(await focado()); i++) await page.keyboard.press('ArrowLeft')
  expect(await focado()).toMatch(/Filme Explosivo/)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/movies\/1$/)
})

test('TV: sem botoes de download', async ({ page }) => {
  await page.goto('/movies/1')
  await expect(page.getByRole('heading', { name: 'Filme Explosivo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Baixar para ver offline' })).toHaveCount(0)
})
