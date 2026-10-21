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

  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft') // vai ate o menu lateral
  expect(await page.evaluate(() => !!document.activeElement?.closest('header'))).toBe(true)
  await page.keyboard.press('ArrowRight') // e volta para o conteudo
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('#main-content'))).toBe(true)

  await page.keyboard.press('ArrowDown') // filtros -> primeira fileira
  await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-spatial'))).toBe(true)
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

test('TV: no player o OK mostra os controles e as setas andam entre os botoes', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __toques: number }
    w.__toques = 0
    const { play, pause } = HTMLMediaElement.prototype
    HTMLMediaElement.prototype.play = function () { w.__toques++; return play.call(this) }
    HTMLMediaElement.prototype.pause = function () { w.__toques++; return pause.call(this) }
  })
  await page.goto('/movies/3')
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page).toHaveURL(/\/watch\/movie\/3/)
  await expect(page.getByRole('button', { name: 'Play/Pause' })).toBeAttached()
  const focado = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')

  await page.keyboard.press('Enter') // OK sem nada focado: foca o Play/Pause
  expect(await focado()).toBe('Play/Pause')

  await page.keyboard.press('ArrowRight') // seta: proximo botao do player, nao pula 10 s
  expect(await focado()).not.toBe('Play/Pause')
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-controls]'))).toBe(true)

  await page.keyboard.press('ArrowLeft')
  expect(await focado()).toBe('Play/Pause')
  // Conta play()/pause() em vez de olhar o video tocando: aqui o video pode nem carregar (codec do Chromium de teste).
  const chamadas = () => page.evaluate(() => (window as unknown as { __toques: number }).__toques)
  const antes = await chamadas()
  await page.keyboard.press('Enter') // OK no botao: aperta (play/pause)
  await expect.poll(chamadas).toBeGreaterThan(antes)
})

test('TV: menu na lateral; da seta para a esquerda no conteudo cai na secao aberta', async ({ page }) => {
  await page.goto('/movies')
  await expect(page.getByRole('heading', { name: 'Ação' })).toBeVisible()
  const menu = (await page.locator('header').boundingBox())!
  expect(menu.x).toBe(0)
  expect(menu.height).toBeGreaterThan(500) // ocupa a altura da tela, nao uma faixa no topo

  await page.keyboard.press('ArrowDown')
  for (let i = 0; i < 6 && !(await page.evaluate(() => !!document.activeElement?.closest('header'))); i++) await page.keyboard.press('ArrowLeft')
  await expect(page.locator('header a[aria-current="page"]')).toBeFocused()
  await expect(page.locator('header a[aria-current="page"]')).toHaveText('Filmes')
  await page.keyboard.press('ArrowLeft') // borda esquerda: fica onde esta
  await expect(page.locator('header a[aria-current="page"]')).toBeFocused()
})

test('TV: passar pela busca com as setas nao abre o teclado; o OK abre e ai da para digitar', async ({ page }) => {
  await page.goto('/movies')
  await expect(page.getByRole('heading', { name: 'Ação' })).toBeVisible()
  const busca = page.getByRole('searchbox', { name: 'Buscar' })
  await page.keyboard.press('ArrowDown')
  for (let i = 0; i < 6 && !(await page.evaluate(() => !!document.activeElement?.closest('header'))); i++) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < 6 && !(await busca.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('ArrowDown')
  await expect(busca).toBeFocused()
  // Campo so de leitura = o Android nao sobe o teclado da tela so por passar por ele.
  expect(await busca.evaluate((el: HTMLInputElement) => el.readOnly)).toBe(true)

  await page.keyboard.press('Enter') // OK: libera para digitar, sem buscar nada ainda
  await expect(busca).toBeFocused()
  expect(await busca.evaluate((el: HTMLInputElement) => el.readOnly)).toBe(false)
  await expect(page).toHaveURL(/\/movies$/)

  await page.keyboard.type('Explosivo')
  await expect(busca).toHaveValue('Explosivo')
  // As capas aparecem enquanto digita, sem precisar confirmar, e o campo continua com o foco.
  await expect(page).toHaveURL(/\/search\?q=Explosivo$/)
  await expect(page.getByRole('button', { name: /Filme Explosivo/ }).first()).toBeVisible()
  await expect(busca).toBeFocused()
})

test('TV: o perfil aparece com nome no menu e cache/diagnostico ficam em Ajustes', async ({ page }) => {
  await page.goto('/')
  const conta = page.getByRole('button', { name: 'Conta', exact: true })
  await expect(conta).not.toHaveText(/^.$/)
  await conta.click()
  await expect(page.getByRole('button', { name: 'Limpar cache' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Limpar cache' })).toBeVisible()
})

test('TV: da seta para a esquerda no primeiro poster de uma fileira chega ao menu', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Adicionados recentemente')).toBeVisible()
  for (let i = 0; i < 6 && !(await page.evaluate(() => document.activeElement?.hasAttribute('data-spatial'))); i++) await page.keyboard.press('ArrowDown')
  for (let i = 0; i < 12 && !(await page.evaluate(() => !!document.activeElement?.closest('header'))); i++) await page.keyboard.press('ArrowLeft')
  await expect(page.locator('header a[aria-current="page"]')).toBeFocused()
  // A tela nao desliza para o lado no caminho (cortava o menu na TV).
  expect(await page.evaluate(() => [document.scrollingElement!.scrollLeft, document.getElementById('main-content')!.scrollLeft, document.getElementById('main-content')!.parentElement!.scrollLeft])).toEqual([0, 0, 0])
})

test('TV: suporte so com setas e OK', async ({ page }) => {
  await page.route('**/api/feedback', (route) => route.fulfill({ status: 204 }))
  await page.goto('/suporte')
  await expect(page.getByRole('heading', { name: 'Suporte' })).toBeVisible()
  const campo = page.getByPlaceholder('O que está acontecendo?')
  for (let i = 0; i < 6 && !(await campo.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('ArrowDown')
  await expect(campo).toBeFocused()
  await page.keyboard.press('Enter') // OK libera o teclado da TV
  await page.keyboard.type('Travou no canal')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Recebido, valeu!' })).toBeVisible()
})

test('TV: filtros de filmes (ano + categoria) so com setas e OK', async ({ page }) => {
  await page.goto('/movies')
  await expect(page.getByRole('heading', { name: 'Ação' })).toBeVisible()
  const escolher = async (filtro: string, opcao: string) => {
    const botao = page.getByRole('button', { name: filtro, exact: true })
    for (let i = 0; i < 8 && !(await botao.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('ArrowRight')
    await expect(botao).toBeFocused()
    await page.keyboard.press('Enter')
    const item = page.getByRole('option', { name: opcao, exact: true })
    for (let i = 0; i < 10 && !(await item.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('ArrowDown')
    await expect(item).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(botao).toBeFocused()
  }
  await page.keyboard.press('ArrowDown') // o foco entra no conteudo, nos filtros
  await escolher('Ano', '2019')
  await escolher('Categoria', 'Ação')
  await expect(page.getByRole('button', { name: /Corrida Final/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Filme Explosivo/ })).toHaveCount(0)
})

test('TV: "Ver tudo" de uma fileira em Filmes e Series abre a categoria inteira so com setas e OK', async ({ page }) => {
  // Suporte 21/10: o link so trocava o ?category= da propria pagina, que lia isso uma vez ao montar.
  const itens = (campo: string) => Array.from({ length: 60 }, (_, i) => ({ [campo]: 9000 + i, name: `Titulo ${i}`, category_id: '10', rating: '7.0', cover: '', stream_icon: '' }))
  await page.route(/action=get_vod_streams/, (r) => r.fulfill({ json: itens('stream_id') }))
  await page.route(/action=get_series(&|$)/, (r) => r.fulfill({ json: itens('series_id') }))
  for (const rota of ['/movies', '/series']) {
    await page.goto(rota)
    await page.getByRole('button', { name: /Titulo 0/ }).first().focus()
    await page.keyboard.press('ArrowUp')
    await expect(page.locator(':focus')).toHaveText('Ver tudo')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/category=\d+/)
    await expect(page.getByRole('button', { name: /Titulo 59/ })).toBeAttached()
    await page.goBack()
    await expect(page).not.toHaveURL(/category=/)
    await expect(page.getByRole('link', { name: 'Ver tudo' }).first()).toBeVisible()
  }
})
