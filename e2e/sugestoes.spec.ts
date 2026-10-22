import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

// Busca por frase e "Parecidos com este" (/api/sugestoes, Workers AI no Worker). A IA devolve nomes; so aparece o que
// existe no catalogo. Sem IA (204), tudo segue como antes.
async function mockIa(page: Page, titles: string[] | null) {
  const pedidos: string[] = []
  await page.route('**/api/sugestoes?*', (route) => {
    pedidos.push(decodeURIComponent(new URL(route.request().url()).search.replace(/\+/g, ' ')))
    return titles ? route.fulfill({ json: { titles } }) : route.fulfill({ status: 204 })
  })
  return pedidos
}

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('frase com 3+ palavras mostra o que combina, achando pelo nome sem acento e sem o ano', async ({ page }) => {
  const pedidos = await mockIa(page, ['Amor e Confusao', 'Love and Mess', 'Risada Garantida (2024)', 'Filme Que Nao Existe', 'Série Dramática'])
  await page.goto('/search?q=comedia romantica leve')
  const secao = page.locator('section', { has: page.getByRole('heading', { name: 'Combina com a sua busca' }) })
  await expect(secao.getByRole('button', { name: /Amor e Confusão/ })).toBeVisible()
  await expect(secao.getByRole('button', { name: /Risada Garantida/ })).toBeVisible()
  await expect(secao.getByRole('button', { name: /Série Dramática/ })).toBeVisible()
  await expect(secao.getByRole('button')).toHaveCount(3)
  expect(pedidos[0]).toContain('q=comedia romantica leve')
  await secao.getByRole('button', { name: /Série Dramática/ }).click()
  await expect(page).toHaveURL(/\/series\/50$/)
})

test('nome curto que acha resultado nao gasta a IA; sem IA a busca fica como antes', async ({ page }) => {
  const pedidos = await mockIa(page, null)
  await page.goto('/search?q=filme')
  await expect(page.getByRole('button', { name: /Filme Explosivo/ })).toBeVisible()
  await page.goto('/search?q=nada parecido aqui')
  await expect(page.getByText('Nada encontrado para "nada parecido aqui"')).toBeVisible()
  expect(pedidos.filter((p) => p.includes('q=filme'))).toHaveLength(0)
  expect(pedidos.some((p) => p.includes('q=nada parecido aqui'))).toBe(true)
})

test('filme mostra "Parecidos com este" sem ele mesmo; serie pergunta por series', async ({ page }) => {
  const pedidos = await mockIa(page, ['Filme Explosivo', 'Corrida Final', 'Outra Série'])
  await page.goto('/movies/1')
  const fileira = page.locator('section', { has: page.getByRole('heading', { name: 'Parecidos com este' }) })
  await expect(fileira.getByRole('button', { name: /Corrida Final/ })).toBeVisible()
  await expect(fileira.getByRole('button', { name: /Filme Explosivo/ })).toHaveCount(0)
  await expect(fileira.getByRole('button', { name: /Outra Série/ })).toHaveCount(0) // filme so sugere filme
  expect(pedidos[0]).toMatch(/like=Filme Explosivo&kind=movie/)

  await page.goto('/series/50')
  await expect(page.getByRole('heading', { name: 'Parecidos com este' })).toBeVisible()
  expect(pedidos.some((p) => /like=Série Dramática&kind=tv/.test(p))).toBe(true)
})

test('sem IA a pagina do filme nao mostra a fileira', async ({ page }) => {
  await mockIa(page, null)
  await page.goto('/movies/1')
  await expect(page.getByRole('button', { name: 'Assistir' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Parecidos com este' })).toHaveCount(0)
})

test.describe('TV (so setas e OK)', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })
  const focado = (page: Page) => page.evaluate(() => (document.activeElement === document.body ? '' : document.activeElement?.textContent || '').trim())

  test('na pagina do filme as setas descem ate "Parecidos" e o OK abre', async ({ page }) => {
    await mockIa(page, ['Corrida Final', 'Risada Garantida'])
    await page.goto('/movies/1')
    await expect(page.getByRole('button', { name: /Risada Garantida/ })).toBeVisible()
    for (let i = 0; i < 8 && !/Corrida Final/.test(await focado(page)); i++) await page.keyboard.press('ArrowDown')
    expect(await focado(page)).toMatch(/Corrida Final/)
    await page.keyboard.press('ArrowRight')
    expect(await focado(page)).toMatch(/Risada Garantida/)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/movies\/4$/)
  })

  test('na busca por frase as setas chegam nas sugestoes', async ({ page }) => {
    await mockIa(page, ['Amor e Confusão'])
    await page.goto('/search?q=comedia romantica leve')
    await expect(page.getByRole('button', { name: /Amor e Confusão/ })).toBeVisible()
    for (let i = 0; i < 6 && !/Amor e Confusão/.test(await focado(page)); i++) await page.keyboard.press('ArrowDown')
    expect(await focado(page)).toMatch(/Amor e Confusão/)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/movies\/5$/)
  })
})
