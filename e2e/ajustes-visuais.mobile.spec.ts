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
  const avatar = (await page.getByRole('button', { name: 'Conta', exact: true }).boundingBox())!
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

// Paisagem de iPhone (852x393): tudo do cabecalho cabe na tela. Com as margens da Dynamic Island no cabecalho
// (#77) o conteudo nao cabia e o avatar saia pela borda direita (video de 08/10).
test('paisagem: o avatar do cabecalho fica dentro da tela', async ({ page }) => {
  await page.setViewportSize({ width: 852, height: 393 })
  await seedSession(page)
  await page.goto('/')
  const avatar = (await page.getByRole('button', { name: 'Conta', exact: true }).boundingBox())!
  expect(avatar.x + avatar.width).toBeLessThanOrEqual(852 - 16)
})

// O fundo do cabecalho nao muda com a rolagem (antes alternava transparente/vidro com 300ms e piscava sobre
// destaques claros — video de 08/10).
test('cabecalho igual no topo e rolado, sem animacao', async ({ page }) => {
  await seedSession(page)
  await page.goto('/movies')
  const header = page.locator('header')
  const estilo = () => header.evaluate((el) => { const c = getComputedStyle(el); return [c.backgroundImage, c.backgroundColor, c.transitionDuration] })
  const antes = await estilo()
  await page.locator('#main-content').evaluate((el) => el.scrollTo(0, 600))
  await page.waitForTimeout(400)
  expect(await estilo()).toEqual(antes)
  expect(antes[2]).toBe('0s')
})

// Toda largura entre celular e computador: o cabecalho cabe (o avatar fica dentro da tela) e ha sempre um menu
// de navegacao visivel — as abas do topo ou o menu flutuante de baixo. Em 654px (painel do navegador do app) o
// cabecalho de computador estourava (08/10).
test('cabecalho cabe e ha navegacao em todas as larguras', async ({ page }) => {
  await seedSession(page)
  await page.goto('/movies')
  for (let w = 360; w <= 1100; w += 40) {
    await page.setViewportSize({ width: w, height: 800 })
    const avatar = (await page.getByRole('button', { name: 'Conta', exact: true }).boundingBox())!
    expect(avatar.x + avatar.width, `largura ${w}`).toBeLessThanOrEqual(w)
    const abas = await page.locator('header nav').isVisible()
    const menuDeBaixo = await page.locator('nav').filter({ hasText: 'Séries' }).last().isVisible()
    expect(abas || menuDeBaixo, `largura ${w}`).toBe(true)
  }
})

// Titulo longo do provedor no destaque (painel de 654px, 08/10): subia ate o cabecalho e ficava por cima do logo,
// com "[L] (2025) (2025) (2025)". Agora 2 linhas no maximo e sem os enfeites.
test('titulo longo do destaque nao invade o cabecalho', async ({ page }) => {
  const longo = 'Purgatorio - Limbo - Arafta - Bound by Fate Amor e Confusão [L] (2025) (2025) (2025)'
  // Todo filme e serie com o nome longo: qualquer um que o destaque escolher (ele alterna pelo relogio) serve.
  await page.route(/action=(get_vod_streams|get_series)&/, async (route) => {
    const res = await route.fetch()
    const json = (await res.json()) as { name: string }[]
    await route.fulfill({ response: res, json: json.map((m) => ({ ...m, name: longo })) })
  })
  await seedSession(page)
  for (const largura of [390, 654]) {
    await page.setViewportSize({ width: largura, height: 800 })
    await page.goto('/')
    const titulo = page.locator('h1').filter({ hasText: 'Purgatorio' })
    await expect(titulo).toBeVisible({ timeout: 15000 })
    await expect(titulo).not.toContainText('[L]')
    expect((await titulo.textContent())!.match(/\(2025\)/g)).toHaveLength(1)
    const cabecalho = (await page.locator('header').boundingBox())!
    const caixa = (await titulo.boundingBox())!
    expect(caixa.y, `largura ${largura}`).toBeGreaterThanOrEqual(cabecalho.y + cabecalho.height - 8)
  }
})

// Os posteres tambem sem os enfeites do provedor (mesma limpeza do destaque).
test('poster mostra o titulo sem [L] e sem ano repetido', async ({ page }) => {
  await page.route(/action=get_vod_streams&/, async (route) => {
    const res = await route.fetch()
    const json = (await res.json()) as { name: string }[]
    await route.fulfill({ response: res, json: json.map((m) => (m.name === 'Filme Explosivo' ? { ...m, name: 'Filme Explosivo [L] (2025) (2025)' } : m)) })
  })
  await seedSession(page)
  await page.goto('/movies')
  const poster = page.getByRole('button', { name: /^Filme Explosivo/ }).first()
  await expect(poster).toBeVisible({ timeout: 15000 })
  await expect(poster).toContainText('Filme Explosivo (2025)')
  await expect(poster).not.toContainText('[L]')
})
