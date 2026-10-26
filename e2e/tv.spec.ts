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

test('TV: Buscar no menu abre a pagina de busca; passar pelo campo nao abre o teclado, o OK abre e da para digitar', async ({ page }) => {
  await page.goto('/movies')
  await expect(page.getByRole('heading', { name: 'Ação' })).toBeVisible()
  const buscar = page.getByRole('link', { name: 'Buscar' })
  await page.keyboard.press('ArrowDown')
  for (let i = 0; i < 6 && !(await page.evaluate(() => !!document.activeElement?.closest('header'))); i++) await page.keyboard.press('ArrowLeft')
  for (let i = 0; i < 8 && !(await buscar.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('ArrowDown')
  await expect(buscar).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/search$/)

  const campo = page.getByRole('searchbox', { name: 'Buscar no catálogo' })
  await expect(campo).toBeFocused()
  // Campo so de leitura = o Android nao sobe o teclado da tela so por chegar nele.
  expect(await campo.evaluate((el: HTMLInputElement) => el.readOnly)).toBe(true)
  await page.keyboard.press('Enter') // OK: libera para digitar
  expect(await campo.evaluate((el: HTMLInputElement) => el.readOnly)).toBe(false)

  await page.keyboard.type('Explosivo')
  await expect(campo).toHaveValue('Explosivo')
  // As capas aparecem enquanto digita (depois de uma pausa), e o campo continua com o foco.
  await expect(page).toHaveURL(/\/search\?q=Explosivo$/)
  await expect(page.getByRole('button', { name: /Filme Explosivo/ }).first()).toBeVisible()
  await expect(campo).toBeFocused()
  // Confirmar no teclado da TV nao empilha historico: um Voltar sai da busca.
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/search\?q=Explosivo$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/movies$/)
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

test('TV: so com as setas e OK da para abrir um campeonato nos canais', async ({ page }) => {
  await page.route(/action=get_live_streams.*category_id=2/, async (route) => {
    const streams = await (await route.fetch()).json()
    await route.fulfill({ json: [...streams, { ...streams[0], stream_id: 203, name: 'ESPN 4 - Champions League' }] })
  })
  await page.goto('/live')
  await expect(page.getByText('Futebol HD')).toBeVisible()
  const focado = () => page.evaluate(() => (document.activeElement?.textContent || '').trim())
  const ate = async (texto: RegExp) => {
    for (let i = 0; i < 15 && !texto.test(await focado()); i++) await page.keyboard.press('ArrowDown')
    expect(await focado()).toMatch(texto)
  }
  await ate(/^Campeonatos$/)
  await page.keyboard.press('Enter')
  await ate(/^Champions League/)
  await page.keyboard.press('Enter')
  await expect(page.getByText('ESPN 4 - Champions League')).toBeVisible()
  await expect(page.getByText('Futebol HD')).toHaveCount(0)
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

test('TV: nos times favoritos, so com setas e OK chega no canal do jogo e abre a busca dele', async ({ page }) => {
  await page.route('**/api/moltv/v1/search?*', (route) => route.fulfill({ json: { results: [{ type: 'team', slug: 'flamengo', name: 'Flamengo' }] } }))
  await page.route('**/api/moltv/v1/teams/flamengo/next', (route) =>
    route.fulfill({
      json: {
        matches: [
          {
            match: { id: 'fd:1', home: 'Flamengo', away: 'Vasco', kickoff: '2030-10-26T23:00:00Z', competition: 'Brasileirão', status: 'scheduled' },
            broadcasts: [{ channel: 'Premiere', slug: 'premiere', confidence: 'confirmada' }],
          },
        ],
      },
    }),
  )
  await page.goto('/times')
  await page.getByLabel('Seguir um time').focus()
  await page.keyboard.press('Enter') // na TV o OK abre o teclado do campo
  await page.keyboard.type('flam')
  await page.getByRole('button', { name: 'Flamengo', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Premiere: procurar o canal' })).toBeVisible()

  const focado = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || '')
  for (let i = 0; i < 8 && !/^Premiere/.test(await focado()); i++) await page.keyboard.press('ArrowDown')
  expect(await focado()).toMatch(/^Premiere/)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/search\?q=Premiere$/)
})

test('TV: Organizar categorias funciona so com setas e OK e cabe na tela', async ({ page }) => {
  await page.goto('/categorias')
  await expect(page.getByRole('button', { name: 'Esconder Notícias' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(960)
  const focado = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')

  await page.keyboard.press('ArrowDown') // primeira seta: o foco entra no conteudo
  for (let i = 0; i < 12 && (await focado()) !== 'Esconder Notícias'; i++) await page.keyboard.press('ArrowDown')
  expect(await focado()).toBe('Esconder Notícias')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Mostrar Notícias' })).toBeFocused()
})

test('TV: no ao vivo a seta abre a lista de canais e o OK troca de canal', async ({ page }) => {
  await page.goto('/watch/live/101?name=Canal')
  const lista = page.getByRole('dialog', { name: 'Lista de canais' })
  // A lista de canais do zapping carrega depois do player; a seta so abre a lista quando ela existe.
  await expect(async () => {
    await page.keyboard.press('ArrowRight')
    await expect(lista).toBeVisible({ timeout: 1000 })
  }).toPass()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/watch\/live\/102/)
})

test('TV: o teste de som dos Ajustes toca a voz do canal central com e sem a mistura em estereo', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __mixados: number }
    w.__mixados = 0
    const original = AudioContext.prototype.createMediaElementSource
    AudioContext.prototype.createMediaElementSource = function (el) { w.__mixados++; return original.call(this, el) }
  })
  await page.goto('/diagnostico')
  const tocado = page.waitForRequest(/voz-centro-5\.1-aac\.mp4/)
  await page.getByRole('button', { name: 'AAC normal' }).click()
  await tocado
  await page.getByRole('button', { name: 'AAC com mistura' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mixados: number }).__mixados)).toBe(1)
})

test('TV: o som do filme passa pelo Web Audio para o 5.1 sair em estereo (com a voz do canal central)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __mixados: number }
    w.__mixados = 0
    const original = AudioContext.prototype.createMediaElementSource
    AudioContext.prototype.createMediaElementSource = function (el) { w.__mixados++; return original.call(this, el) }
  })
  await page.goto('/movies/3')
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page).toHaveURL(/\/watch\/movie\/3/)
  // O Chromium de teste pode nao decodificar o video: dispara o "playing" na mao.
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.currentSrc ?? '')).not.toBe('')
  await page.evaluate(() => document.querySelector('video')!.dispatchEvent(new Event('playing')))
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mixados: number }).__mixados)).toBe(1)
})

test('TV: se a mistura deixar o filme mudo, ela desliga neste aparelho e o player recarrega', async ({ page }) => {
  await page.clock.install()
  await page.addInitScript(() => {
    // Mistura muda: o analisador so le zeros, e o video finge estar tocando com audio.
    AnalyserNode.prototype.getFloatTimeDomainData = () => {}
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { get: () => false })
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { get: () => 4 })
    Object.defineProperty(HTMLMediaElement.prototype, 'webkitAudioDecodedByteCount', { get: () => 1000 })
  })
  await page.goto('/movies/3')
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.currentSrc ?? '')).not.toBe('')
  await page.evaluate(() => document.querySelector('video')!.dispatchEvent(new Event('playing')))
  await page.clock.runFor(5000)
  expect(await page.evaluate(() => localStorage.getItem('pf-sem-mistura'))).toBeNull()
  const recarregou = page.waitForEvent('load')
  await page.clock.runFor(20000)
  await recarregou
  expect(await page.evaluate(() => localStorage.getItem('pf-sem-mistura'))).toBe('1')
})

test('TV: codigo do grupo com o OK e o teclado da TV', async ({ page }) => {
  let liberado = false
  await page.route('**/api/grupo', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { required: true, ok: liberado } })
    liberado = true
    return route.fulfill({ status: 204 })
  })
  await page.goto('/')
  const campo = page.getByRole('textbox', { name: 'Código do grupo' })
  await expect(campo).toBeFocused() // ja abre com o foco no campo
  await page.keyboard.press('Enter') // OK libera o teclado da TV
  await page.keyboard.type('pedreira')
  // Como no login, o OK do teclado da TV envia (fora do Layout nao ha navegacao por setas do app).
  await page.keyboard.press('Enter')
  await expect(campo).toBeHidden()
})

test('TV: menus do player cabem acima da barra de baixo, todos os botoes se alcancam e Voltar fecha', async ({ page }) => {
  await page.goto('/watch/movie/1?ext=mp4&name=Filme')
  await expect(page.getByRole('button', { name: 'Play/Pause' })).toBeAttached()
  await page.keyboard.press('Enter') // mostra os controles
  await page.getByRole('button', { name: 'Ajustes de exibição' }).focus()
  await page.keyboard.press('Enter')
  const painel = page.locator('.menu-panel')
  await expect(painel).toBeVisible()
  // Desce pelo menu ate o ultimo "Desligar em": nenhum item focado pode ficar coberto pela barra de controles.
  const coberto = () => page.evaluate(() => {
    const a = document.activeElement as HTMLElement
    const r = a.getBoundingClientRect()
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return !!top && top !== a && !a.contains(top) && !top.contains(a)
  })
  const rotulo = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')
  const vistos = new Set<string>()
  for (let i = 0; i < 12 && !vistos.has('90min'); i++) {
    await page.keyboard.press('ArrowDown')
    vistos.add(await rotulo())
    if ((await rotulo()).includes('min') || (await rotulo()) === 'Nunca') expect(await coberto(), await rotulo()).toBe(false)
  }
  expect(vistos.has('90min')).toBe(true)

  await page.keyboard.press('Escape') // Voltar do controle
  await expect(painel).toHaveCount(0)
  await expect(page).toHaveURL(/\/watch\/movie\/1/)
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Ajustes de exibição')
})

test('TV: o Voltar do Android (historico) fecha o menu do player e so o proximo Voltar sai', async ({ page }) => {
  await page.goto('/movies/3')
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page).toHaveURL(/\/watch\/movie\/3/)
  await page.keyboard.press('Enter')
  const idx = () => page.evaluate(() => history.state?.idx as number)
  const antes = await idx()
  await page.getByRole('button', { name: 'Ajustes de exibição' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.menu-panel')).toBeVisible()
  await page.goBack() // o botao Voltar do Fire TV chama webView.goBack(): nao manda tecla para a pagina
  await expect(page.locator('.menu-panel')).toHaveCount(0)
  expect(await idx()).toBe(antes) // continua na mesma tela do player
  await page.waitForTimeout(300)
  // Escolher uma opcao fecha o menu e tira a marca do historico: o Voltar seguinte sai do player de uma vez.
  await page.getByRole('button', { name: 'Ajustes de exibição' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: /Preencher/ }).click()
  await expect(page.locator('.menu-panel')).toHaveCount(0)
  await page.waitForFunction(() => !history.state?.pfMenu) // o history.back() que tira a marca e assincrono
  await page.goBack()
  await expect.poll(idx).toBe(antes - 1)
})

for (const tecla of [{ key: 'Escape' }, { key: 'GoBack' }, { key: 'XF86Back', keyCode: 10009 }]) {
  test(`TV: a tecla ${tecla.key} do controle fecha o menu do player e devolve o foco ao botao`, async ({ page }) => {
    await page.goto('/watch/movie/1?ext=mp4&name=Filme')
    await expect(page.getByRole('button', { name: 'Play/Pause' })).toBeAttached()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Ajustes de exibição' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.menu-panel')).toBeVisible()
    await page.evaluate((t) => window.dispatchEvent(new KeyboardEvent('keydown', { key: t.key, keyCode: t.keyCode, bubbles: true })), tecla)
    await expect(page.locator('.menu-panel')).toHaveCount(0)
    await expect(page).toHaveURL(/\/watch\/movie\/1/)
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Ajustes de exibição')
  })
}

test('TV: no ao vivo, de Tela cheia as setas sobem pela coluna dos botoes de canal e descem de volta', async ({ page }) => {
  await page.goto('/watch/live/101?name=Canal')
  const focado = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
  await expect(page.getByRole('button', { name: 'Lista de canais' })).toBeAttached()
  await page.keyboard.press('Enter') // foca o Play/Pause
  for (let i = 0; i < 6 && (await focado()) !== 'Tela cheia'; i++) await page.keyboard.press('ArrowRight')
  expect(await focado()).toBe('Tela cheia')
  for (const esperado of ['Canal anterior', 'Lista de canais', 'Próximo canal']) {
    await page.keyboard.press('ArrowUp')
    expect(await focado()).toBe(esperado)
  }
  await page.keyboard.press('Enter') // OK em "Próximo canal" zapeia
  await expect(page).toHaveURL(/\/watch\/live\/(?!101)\d+/)
})
