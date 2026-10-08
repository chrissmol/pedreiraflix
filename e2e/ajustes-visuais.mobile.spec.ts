import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Ajustes do video do iPhone (08/10): busca redonda, espaco igual no cabecalho e destaque que nao vira um
// vazio enquanto o catalogo carrega.
test('cabecalho: busca redonda e o mesmo espaco entre busca e avatar', async ({ page }) => {
  await seedSession(page)
  await page.goto('/')
  const busca = page.getByRole('searchbox', { name: 'Buscar' })
  const caixa = (await busca.boundingBox())!
  expect(Math.abs(caixa.width - caixa.height)).toBeLessThan(1)
  expect(await busca.evaluate((el) => getComputedStyle(el).appearance)).toBe('none')
  const avatar = (await page.getByRole('button', { name: 'Conta' }).boundingBox())!
  expect(avatar.x - (caixa.x + caixa.width)).toBeCloseTo(12, 0)
  // Lupa no centro do circulo.
  const lupa = (await page.locator('header form svg').boundingBox())!
  expect(Math.abs(lupa.x + lupa.width / 2 - (caixa.x + caixa.width / 2))).toBeLessThan(1.5)
  // Ao tocar, o campo abre e mostra o texto de exemplo.
  await busca.focus()
  await expect.poll(async () => (await busca.boundingBox())!.width).toBeGreaterThan(100)
  expect(await busca.evaluate((el) => getComputedStyle(el, '::placeholder').color)).not.toBe('rgba(0, 0, 0, 0)')
})

test('destaque mostra o esqueleto enquanto carrega e depois o titulo', async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=get_vod_streams&/, async (route) => {
    await new Promise((r) => setTimeout(r, 2000))
    await route.continue()
  })
  await seedSession(page)
  await page.goto('/')
  await expect(page.getByTestId('hero-carregando')).toBeVisible()
  await expect(page.getByTestId('hero-carregando')).toHaveCount(0, { timeout: 15000 })
  await expect(page.locator('h1')).toBeVisible()
})
