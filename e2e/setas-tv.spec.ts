import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

// Setas do controle, passo a passo, como num app de streaming (reclamacao do Chris em 10/11: "setas bugadas" em Filmes,
// Series e Canais). Cada teste aperta uma seta e confere para onde o foco foi, nao so se da para chegar.
test.use({
  userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
  viewport: { width: 960, height: 540 },
})

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

const foco = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement
    const fileira = a.closest('[data-row]')
    return {
      nome: (a.getAttribute('aria-label') || a.getAttribute('placeholder') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30),
      fileira: fileira ? [...document.querySelectorAll('[data-row]')].indexOf(fileira) : -1,
      indice: fileira ? [...fileira.querySelectorAll('[data-spatial]')].indexOf(a) : -1,
      x: Math.round(a.getBoundingClientRect().left),
    }
  })
const tecla = async (page: Page, k: string, vezes = 1) => {
  for (let i = 0; i < vezes; i++) {
    await page.keyboard.press(k)
    await page.waitForTimeout(350) // deixa a rolagem suave terminar, como quem aperta e olha
  }
}

// Series usa a mesma fileira (Row.tsx); o catalogo de teste so tem 2 series, pouco para rolar.
for (const rota of ['/movies']) {
  test(`TV ${rota}: o foco fica na mesma posicao da fileira e cada fileira lembra onde parou`, async ({ page }) => {
    await page.goto(rota)
    await expect(page.getByRole('button', { name: 'Filtros' })).toBeVisible()
    await expect.poll(() => page.locator('[data-row] [data-spatial]').count()).toBeGreaterThan(3)
    // Fileiras estreitas para a de cima precisar rolar, como acontece com o catalogo de verdade (40 titulos por fileira).
    await page.addStyleTag({ content: '[data-row] { max-width: 22rem }' })
    await expect(page.getByRole('button', { name: 'Filtros' })).toBeFocused() // a tela ja abre com o foco no primeiro item
    await tecla(page, 'ArrowRight') // fim da linha: nao cai num poster da linha de baixo
    await expect(page.getByRole('button', { name: 'Filtros' })).toBeFocused()

    await tecla(page, 'ArrowDown') // dos filtros para o PRIMEIRO cartao, nao para o que estiver embaixo do botao
    const primeiro = await foco(page)
    expect(primeiro).toMatchObject({ fileira: 0, indice: 0 })
    await tecla(page, 'ArrowRight', 2)
    const terceiro = await foco(page)
    expect(terceiro).toMatchObject({ fileira: 0, indice: 2 })
    expect(Math.abs(terceiro.x - primeiro.x)).toBeLessThanOrEqual(2) // a fileira correu, o foco ficou no lugar

    await tecla(page, 'ArrowDown')
    const abaixo = await foco(page)
    expect(abaixo).toMatchObject({ fileira: 1, indice: 0 }) // fileira nova comeca do primeiro, na mesma coluna da tela
    expect(Math.abs(abaixo.x - primeiro.x)).toBeLessThanOrEqual(2)
    await tecla(page, 'ArrowUp')
    expect(await foco(page)).toMatchObject({ fileira: 0, indice: 2 }) // a de cima lembra onde parou
  })
}

test('TV: subir e descer depressa pelas fileiras nao prende o foco', async ({ page }) => {
  await page.goto('/movies')
  await expect(page.getByRole('heading', { name: 'Comédia' })).toBeVisible()
  await tecla(page, 'ArrowDown', 2)
  const total = await page.locator('[data-row]').count()
  for (let i = 0; i < total + 2; i++) await page.keyboard.press('ArrowDown') // sem esperar a rolagem
  expect((await foco(page)).fileira).toBe(total - 1)
  for (let i = 0; i < total - 1; i++) await page.keyboard.press('ArrowUp')
  expect((await foco(page)).fileira).toBe(0)
})

test('TV: "Continuar assistindo" anda de cartao em cartao, sem parar no X de remover', async ({ page }) => {
  await page.addInitScript(() => {
    const item = (id: string, name: string) => ({ kind: 'movie', id, name, image: null, ext: 'mp4', positionSeconds: 300, durationSeconds: 1200, updatedAt: Date.now() })
    localStorage.setItem('iptv-library', JSON.stringify({ state: { favorites: [], progress: { 'movie-1': item('1', 'Filme Explosivo'), 'movie-2': item('2', 'Corrida Final') }, watched: {} }, version: 0 }))
  })
  await page.goto('/movies')
  await expect(page.getByRole('heading', { name: 'Continuar assistindo' })).toBeVisible()
  await tecla(page, 'ArrowDown', 2)
  expect(await foco(page)).toMatchObject({ fileira: 0, indice: 0 })
  await tecla(page, 'ArrowRight')
  expect(await foco(page)).toMatchObject({ fileira: 0, indice: 1 })
  await tecla(page, 'ArrowDown')
  expect(await foco(page)).toMatchObject({ fileira: 1, indice: 0 })
  await tecla(page, 'ArrowUp')
  expect(await foco(page)).toMatchObject({ fileira: 0, indice: 1 })
})

test('TV Canais: ferramentas, categorias e canais sao tres blocos e as setas nao pulam de um para outro na diagonal', async ({ page }) => {
  await page.goto('/live')
  const canal = page.locator('[data-nav-group] button[data-spatial], [data-nav-group] button').filter({ hasText: 'Canal Notícias 24h' }).first()
  await expect(canal).toBeVisible()
  const busca = page.getByRole('searchbox', { name: 'Filtrar categorias' })

  await expect(page.getByRole('searchbox', { name: 'Filtrar canais…' })).toBeFocused() // a tela ja abre no primeiro item
  await tecla(page, 'ArrowRight', 5) // linha de ferramentas: para no ultimo botao
  await expect(page.getByRole('link', { name: 'Mosaico' }).or(page.getByRole('button', { name: 'Mosaico' }))).toBeFocused()
  await tecla(page, 'ArrowDown') // de la para o primeiro canal, nao para o "+" de favoritar
  await expect(canal).toBeFocused()
  await tecla(page, 'ArrowRight')
  expect((await foco(page)).nome).toMatch(/^Favoritar/)
  await tecla(page, 'ArrowLeft', 2) // canal, depois a coluna de categorias
  expect(await page.evaluate(() => !!document.activeElement?.closest('aside'))).toBe(true)

  await busca.focus()
  await tecla(page, 'ArrowRight') // do filtro de categorias para a lista de canais, nao para "Guia" na linha de cima
  expect(await page.evaluate(() => document.activeElement?.closest('[data-nav-group]')?.tagName)).toBe('DIV')
  await tecla(page, 'ArrowLeft')
  await tecla(page, 'ArrowDown', 12) // fim das categorias: fica na ultima, nao salta para um canal ao lado
  expect(await page.evaluate(() => !!document.activeElement?.closest('aside'))).toBe(true)
})
