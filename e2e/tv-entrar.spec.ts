import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

// Foco na TV (reclamacoes do Chris em 11/11): OK no menu ou numa categoria ja leva ao primeiro item, o foco do cartao nao
// e cortado, o mosaico anda de quadro em quadro e o detalhe abre em "Assistir", sem "Ler mais".
test.use({
  userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
  viewport: { width: 960, height: 540 },
})

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

const nome = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement
    return (a.getAttribute('aria-label') || a.getAttribute('placeholder') || a.textContent || '').trim().replace(/\s+/g, ' ')
  })
const tecla = async (page: Page, k: string, vezes = 1) => {
  for (let i = 0; i < vezes; i++) {
    await page.keyboard.press(k)
    await page.waitForTimeout(300)
  }
}

test('TV: OK no item do menu leva o foco ao primeiro item da tela, sem seta para a direita', async ({ page }) => {
  await page.goto('/')
  for (const [menu, primeiro] of [['Canais', 'Filtrar canais…'], ['Filmes', 'Filtros'], ['Séries', 'Filtros']] as const) {
    await page.getByRole('link', { name: menu, exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => nome(page), { message: menu }).toBe(primeiro)
  }
  await page.getByRole('link', { name: 'Início', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('#main-content'))).toBe(true)
})

test('TV Canais: OK numa categoria vai ao primeiro canal; o contorno do canal nao e cortado', async ({ page }) => {
  await page.goto('/live')
  await expect(page.getByRole('button', { name: /^Todos os canais/ })).toBeVisible()
  await page.getByRole('button', { name: /^Esportes/i }).first().focus()
  await page.keyboard.press('Enter') // abre o grupo
  await tecla(page, 'ArrowDown')
  await page.keyboard.press('Enter') // escolhe a categoria
  await expect.poll(() => nome(page)).toMatch(/^4Esporte Total/) // o 1o canal da categoria, nao o 2o
  // O cartao nao cresce (a caixa da lista corta o que passa da borda): o contorno cabe dentro do cartao.
  const folga = await page.evaluate(() => {
    const b = document.activeElement as HTMLElement
    const c = b.closest('[data-testid^="live-card"]') as HTMLElement
    const f = b.getBoundingClientRect()
    const k = c.getBoundingClientRect()
    return { esq: f.left - k.left, dir: k.right - f.right, escala: getComputedStyle(b).transform }
  })
  expect(folga.esq).toBeGreaterThanOrEqual(4)
  expect(folga.dir).toBeGreaterThanOrEqual(4)
  expect(folga.escala).toBe('none')
  await tecla(page, 'ArrowLeft') // volta para a categoria aberta
  expect(await nome(page)).toMatch(/^Esportes/)
  // O contorno da categoria nao e cortado pelos lados da coluna.
  const lados = await page.evaluate(() => {
    const b = document.activeElement as HTMLElement
    const a = b.closest('aside') as HTMLElement
    return { esq: b.getBoundingClientRect().left - a.getBoundingClientRect().left, dir: a.getBoundingClientRect().right - b.getBoundingClientRect().right }
  })
  expect(lados.esq).toBeGreaterThanOrEqual(4)
  expect(lados.dir).toBeGreaterThanOrEqual(4)
  await tecla(page, 'ArrowRight') // da categoria para a lista, sem OK: primeiro canal
  expect(await nome(page)).toMatch(/^4Esporte Total/)
})

test('TV Mosaico: seta para a esquerda no quadro da direita vai ao quadro 1, nao ao Sair', async ({ page }) => {
  await page.goto('/mosaico?n=2&c=101,102')
  await expect(page.getByRole('button', { name: /^Ouvir Canal Economia/ })).toBeVisible()
  await page.getByRole('button', { name: /^Ouvir Canal Economia/ }).focus()
  await tecla(page, 'ArrowLeft')
  expect(await nome(page)).toMatch(/^Ouvir Canal Not/)
  await tecla(page, 'ArrowRight')
  expect(await nome(page)).toMatch(/^Ouvir Canal Economia/)
  await tecla(page, 'ArrowLeft')
  await tecla(page, 'ArrowUp') // de cima do quadro 1: o Sair
  expect(await nome(page)).toMatch(/Sair/)
})

test('TV Filme: abre com o foco em Assistir e a sinopse longa nao tem Ler mais', async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=get_vod_info/, async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    json.info.plot = 'Uma historia muito longa. '.repeat(30)
    await route.fulfill({ response: res, json })
  })
  await page.goto('/movies/1')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect.poll(() => nome(page)).toBe('Assistir')
  await expect(page.getByRole('button', { name: 'Ler mais' })).toHaveCount(0)
})

test('TV Filmes: OK em "Ver resultados" do painel de Filtros leva o foco ao primeiro filme', async ({ page }) => {
  await page.goto('/movies')
  await expect(page.getByRole('button', { name: 'Filtros' })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Ver resultados' }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement)?.matches('[data-row] [data-spatial]') ?? false)).toBe(true)
})
