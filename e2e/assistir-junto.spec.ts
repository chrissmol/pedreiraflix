import { expect, test, type BrowserContext, type Page, type WebSocketRoute } from '@playwright/test'
import { SalaJunto } from '../worker/junto.js'
import { seedSession } from './helpers'

// O video do mock nao toca no Chromium da nuvem: o elemento de video vira um falso que obedece play/pause/pulo e
// solta os mesmos eventos. O que se testa aqui e a sincronia, nao o player.
const fakeMedia = () => {
  const state = new WeakMap<HTMLMediaElement, { paused: boolean; t: number }>()
  const s = (el: HTMLMediaElement) => {
    if (!state.has(el)) state.set(el, { paused: true, t: 0 })
    return state.get(el)!
  }
  const proto = HTMLMediaElement.prototype
  Object.defineProperty(proto, 'paused', { get() { return s(this).paused }, configurable: true })
  // Aparelho com rede lenta: o video so fica pronto quando o teste chama __carregar().
  // O arquivo do mock nao abre no Chromium da nuvem e o <video> solta "error": aqui ele nao conta como carregado.
  let ready = !(window as any).__lento
  for (const ev of ['error', 'canplay', 'loadedmetadata', 'loadeddata', 'canplaythrough'])
    addEventListener(ev, (e) => e.target instanceof HTMLMediaElement && e.isTrusted && !ready && e.stopImmediatePropagation(), true)
  Object.defineProperty(proto, 'readyState', { get: () => (ready ? 4 : 0), configurable: true })
  ;(window as any).__carregar = () => {
    ready = true
    for (const v of document.querySelectorAll('video')) for (const ev of ['loadedmetadata', 'canplay']) v.dispatchEvent(new Event(ev))
  }
  Object.defineProperty(proto, 'duration', { get: () => 600, configurable: true })
  Object.defineProperty(proto, 'currentTime', {
    get() { return s(this).t },
    set(v: number) {
      s(this).t = v
      this.dispatchEvent(new Event('seeked'))
    },
    configurable: true,
  })
  proto.play = function () {
    s(this).paused = false
    this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  }
  proto.pause = function () {
    s(this).paused = true
    this.dispatchEvent(new Event('pause'))
  }
}

/** A sala do Worker (worker/junto.js) de verdade, so que com sockets e disco falsos: o que se testa e o codigo que vai para producao. */
function fakeRoom(esperaMs?: number) {
  const sockets: ServerSocket[] = []
  const store = new Map<string, unknown>()
  let alarm: ReturnType<typeof setTimeout> | undefined
  const ctx = {
    acceptWebSocket: (ws: ServerSocket) => sockets.push(ws),
    getWebSockets: () => sockets,
    storage: {
      get: async (k: string) => store.get(k),
      put: async (k: string, v: unknown) => void store.set(k, v),
      delete: async (k: string) => void store.delete(k),
      setAlarm: async (at: number) => {
        clearTimeout(alarm)
        alarm = setTimeout(() => void sala.alarm(), Math.max(0, at - Date.now()))
      },
      deleteAlarm: async () => clearTimeout(alarm),
    },
  }
  const sala = new SalaJunto(ctx)
  if (esperaMs) sala.esperaMs = esperaMs
  const sent: { from: string; msg: Record<string, any> }[] = []
  let queue: Promise<unknown> = Promise.resolve()
  const attach = async (browserCtx: BrowserContext, name: string) => {
    await browserCtx.routeWebSocket(/\/api\/junto\//, (ws) => {
      const server = new ServerSocket(ws)
      ;(globalThis as any).WebSocketPair = class { 0 = {}; 1 = server }
      queue = queue.then(() => sala.fetch(new Request('http://app/api/junto/ABC123', { headers: { upgrade: 'websocket' } })).catch(() => {}))
      ws.onMessage((m) => {
        sent.push({ from: name, msg: JSON.parse(String(m)) })
        queue = queue.then(() => sala.webSocketMessage(server, String(m)))
      })
      ws.onClose(() => {
        queue = queue.then(async () => {
          sockets.splice(sockets.indexOf(server), 1)
          await sala.webSocketClose(server)
        })
      })
    })
  }
  return { attach, sent, sala, estados: (from: string) => sent.filter((s) => s.from === from && s.msg.t === 'estado') }
}
class ServerSocket {
  att: unknown = null
  constructor(private ws: WebSocketRoute) {}
  send(m: string) { this.ws.send(m) }
  close() {}
  serializeAttachment(a: unknown) { this.att = a }
  deserializeAttachment() { return this.att }
}

async function person(browser: import('@playwright/test').Browser, room: ReturnType<typeof fakeRoom>, name: string, options = {}, slow = false) {
  const ctx = await browser.newContext(options)
  await room.attach(ctx, name)
  const page = await ctx.newPage()
  await seedSession(page)
  if (slow) await page.addInitScript(() => ((window as any).__lento = true))
  await page.addInitScript(fakeMedia)
  return page
}

const video = (page: Page) => page.locator('video')

test('dois aparelhos: quem entra segue o titulo, o pulo, a pausa e o play de quem criou, sem eco', async ({ browser }) => {
  const room = fakeRoom()
  const a = await person(browser, room, 'a')
  const b = await person(browser, room, 'b')

  await a.goto('/junto')
  await a.getByRole('button', { name: 'Criar uma sala' }).click()
  const code = (await a.getByTestId('junto-codigo').textContent())!.trim()
  expect(code).toMatch(/^[A-Z2-9]{6}$/)

  await b.goto('/junto')
  await b.getByLabel('Entrar com um código').fill(code.toLowerCase())
  await b.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(b.getByText('2 pessoas na sala.')).toBeVisible()
  await expect(a.getByRole('status').filter({ hasText: `Assistindo junto · ${code} · 2 pessoas` })).toBeVisible()

  // A abre o filme e da play: B vai para o mesmo filme.
  await a.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await video(a).evaluate((v: HTMLVideoElement) => v.play())
  await expect(b).toHaveURL(/\/watch\/movie\/1\?ext=mp4&name=Filme/)
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)

  // A pula para 1:40 e pausa: B fica no mesmo ponto, pausado.
  await video(a).evaluate((v: HTMLVideoElement) => {
    v.currentTime = 100
    v.pause()
  })
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => [Math.round(v.currentTime), v.paused])).toEqual([100, true])

  // A da play de novo: B volta a tocar.
  await video(a).evaluate((v: HTMLVideoElement) => v.play())
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)

  // O que B fez por causa da sala nao volta para ela.
  await b.waitForTimeout(2000)
  expect(room.estados('b')).toEqual([])

  // B pausa no proprio controle: A pausa junto.
  await video(b).evaluate((v: HTMLVideoElement) => v.pause())
  await expect.poll(() => video(a).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
})

test('sair do player nao pausa a sala; sair da sala some o aviso', async ({ browser }) => {
  const room = fakeRoom()
  const a = await person(browser, room, 'a')
  await a.goto('/junto')
  await a.getByRole('button', { name: 'Criar uma sala' }).click()
  // Dentro do app (sem recarregar a pagina, que reconecta e puxa de volta para o titulo da sala).
  await a.evaluate(() => {
    history.pushState({}, '', '/watch/movie/1?ext=mp4&name=Filme')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await video(a).evaluate((v: HTMLVideoElement) => v.play())
  await expect.poll(() => room.sent.length).toBeGreaterThan(0)
  await a.getByRole('button', { name: 'Voltar', exact: true }).click()
  await expect(a).toHaveURL(/\/junto$/)
  await a.waitForTimeout(1000)
  // Sair do player e so "sair": nao e uma pausa.
  expect(room.estados('a').at(-1)!.msg).toMatchObject({ playing: true })
  expect(room.sent.at(-1)!.msg).toEqual({ t: 'sair' })
  await a.getByRole('button', { name: 'Sair da sala' }).click()
  await expect(a.getByRole('button', { name: 'Criar uma sala' })).toBeVisible()
  await expect(a.getByRole('status').filter({ hasText: 'Assistindo junto' })).toHaveCount(0)
})

test('TV: entra na sala so com setas e OK e segue o filme', async ({ browser }) => {
  const room = fakeRoom()
  const a = await person(browser, room, 'a')
  const tv = await person(browser, room, 'tv', {
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })
  await a.goto('/junto')
  await a.getByRole('button', { name: 'Criar uma sala' }).click()
  const code = (await a.getByTestId('junto-codigo').textContent())!.trim()

  await tv.goto('/junto')
  const campo = tv.getByLabel('Entrar com um código')
  for (let i = 0; i < 8 && !(await campo.evaluate((el) => el === document.activeElement)); i++) await tv.keyboard.press('ArrowDown')
  await tv.keyboard.press('Enter') // OK libera o teclado da TV
  await tv.keyboard.type(code)
  await tv.keyboard.press('ArrowRight')
  await tv.keyboard.press('Enter')
  await expect(tv.getByText('2 pessoas na sala.')).toBeVisible()

  await a.goto('/watch/series/5011?ext=mp4&name=Epis%C3%B3dio&seriesId=50')
  await video(a).evaluate((v: HTMLVideoElement) => v.play())
  await expect(tv).toHaveURL(/\/watch\/series\/5011/)
})

// Regra de autoplay do WebKit/iOS: play() com som so passa logo depois de um toque de verdade. Quem entra na sala nao
// toca em nada quando o titulo abre, entao o player cai no mudo; isso nao pode virar a preferencia de volume.
test('convidado: mudo imposto pelo autoplay nao fica salvo e um toque devolve o som', async ({ browser }) => {
  const ctx = await browser.newContext()
  await ctx.routeWebSocket(/\/api\/junto\//, (ws) => {
    ws.send(JSON.stringify({ t: 'pessoas', n: 2 }))
    setTimeout(() => ws.send(JSON.stringify({ t: 'estado', path: '/watch/movie/1?ext=mp4&name=Filme', playing: true, pos: 3, age: 0 })), 2500)
  })
  const page = await ctx.newPage()
  await seedSession(page)
  await page.addInitScript(() => {
    let last = -1e9
    addEventListener('click', (e) => { if (e.isTrusted) last = performance.now() }, true)
    const orig = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      if (!this.muted && performance.now() - last > 1000) return Promise.reject(new DOMException('blocked', 'NotAllowedError'))
      return orig.call(this)
    }
  })
  await page.goto('/junto')
  await page.getByLabel('Entrar com um código').fill('abcdef')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/watch\/movie\/1/)
  await expect(page.getByRole('button', { name: 'Ativar som' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('iptv-player-prefs'))).toBeNull()
  // Proximo titulo da sala: continua pedindo o som em vez de abrir mudo sem aviso.
  await page.evaluate(() => {
    history.pushState({}, '', '/watch/movie/2?ext=mp4&name=Outro')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('button', { name: 'Ativar som' })).toBeVisible()
  await page.locator('video').click({ position: { x: 20, y: 20 } })
  await expect.poll(() => page.evaluate(() => document.querySelector('video')!.muted)).toBe(false)
  await expect(page.getByRole('button', { name: 'Ativar som' })).toHaveCount(0)
  expect(await page.evaluate(() => document.querySelector('video')!.paused)).toBe(false)
})

// Quem abriu a sala com a versao antiga ficou com "mudo" salvo no aparelho: o player nao pode restaurar isso.
test('convidado com mudo salvo por versao antiga abre com som', async ({ browser }) => {
  const ctx = await browser.newContext()
  await ctx.routeWebSocket(/\/api\/junto\//, (ws) => {
    ws.send(JSON.stringify({ t: 'pessoas', n: 2 }))
    setTimeout(() => ws.send(JSON.stringify({ t: 'estado', path: '/watch/movie/1?ext=mp4&name=Filme', playing: true, pos: 3, age: 0 })), 2500)
  })
  const page = await ctx.newPage()
  await seedSession(page)
  await page.addInitScript(() => localStorage.setItem('iptv-player-prefs', JSON.stringify({ state: { volume: 1, muted: true }, version: 0 })))
  await page.goto('/junto')
  await page.getByLabel('Entrar com um código').fill('abcdef')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/watch\/movie\/1/)
  await expect.poll(() => page.evaluate(() => { const v = document.querySelector('video')!; return [v.muted, v.volume] })).toEqual([false, 1])
})

// Ids de filme sao do provedor de cada conta: o anfitriao de outra conta manda um id que aqui nao existe (ou e de outro
// filme). O convidado tem que achar o mesmo titulo pelo nome, e avisar quando a conta dele nao tem.
test('outra conta: acha o filme pelo titulo; sem o titulo, avisa e nao abre nada', async ({ browser }) => {
  const ctx = await browser.newContext()
  const send: { fn?: (m: object) => void } = {}
  await ctx.routeWebSocket(/\/api\/junto\//, (ws) => {
    ws.send(JSON.stringify({ t: 'pessoas', n: 2 }))
    send.fn = (m) => ws.send(JSON.stringify({ t: 'estado', playing: true, pos: 3, age: 0, ...m }))
  })
  const page = await ctx.newPage()
  await seedSession(page)
  await page.addInitScript(fakeMedia)
  await page.goto('/junto')
  await page.getByLabel('Entrar com um código').fill('abcdef')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect.poll(() => !!send.fn).toBe(true)

  send.fn!({ path: '/watch/movie/999999?ext=mp4&name=Filme%20Explosivo', ref: { k: 'movie', t: 'Filme Explosivo' } })
  await expect(page).toHaveURL(/\/watch\/movie\/1\?/)
  await expect(video(page)).toHaveCount(1)
  await expect.poll(() => video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)

  send.fn!({ path: '/watch/movie/888888?ext=mp4&name=Titulo%20Que%20Nao%20Existe', ref: { k: 'movie', t: 'Titulo Que Nao Existe' } })
  await expect(page.getByRole('status').filter({ hasText: 'Sua conta não tem «Titulo Que Nao Existe»' })).toBeVisible()
  await expect(page).toHaveURL(/\/watch\/movie\/1\?/)
})

async function join(a: Page, b: Page) {
  await a.goto('/junto')
  await a.getByRole('button', { name: 'Criar uma sala' }).click()
  const code = (await a.getByTestId('junto-codigo').textContent())!.trim()
  await b.goto('/junto')
  await b.getByLabel('Entrar com um código').fill(code.toLowerCase())
  await b.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(b.getByText('2 pessoas na sala.')).toBeVisible()
}

// Num painel real o catalogo inteiro (sem categoria) tem dezenas de milhares de titulos e demora segundos.
async function catalogoLento(p: Page, ms: number, rename?: (n: string) => string) {
  await p.route(/\/api\/xtream\?.*action=get_(vod_streams|series|live_streams)/, async (route) => {
    if (!/category_id/.test(route.request().url())) await new Promise((r) => setTimeout(r, ms))
    const res = await route.fetch()
    if (!rename) return route.fulfill({ response: res })
    const j = (await res.json()) as { name: string }[]
    await route.fulfill({ response: res, json: j.map((x) => ({ ...x, name: rename(x.name) })) })
  })
}
const paused = (p: Page) => video(p).evaluate((v: HTMLVideoElement) => v.paused)

// Regressao do #194: o caminho achado no catalogo era grafado com %20 e o da tela com +, nunca eram iguais e o convidado
// parava de aplicar play, pausa e pulo; e cada mensagem baixava o catalogo inteiro de novo.
test('mesmo provedor, catalogo lento: pausa, play e pulo chegam na hora e a tela de quem criou nao muda', async ({ browser }) => {
  const room = fakeRoom()
  const a = await person(browser, room, 'a')
  const b = await person(browser, room, 'b')
  await catalogoLento(b, 2500)
  await join(a, b)
  await a.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo&image=http%3A%2F%2Fx%2Fp.jpg')
  const urlA = a.url()
  await video(a).evaluate((v: HTMLVideoElement) => v.play())
  await expect(b).toHaveURL(/\/watch\/movie\/1\?/, { timeout: 15_000 })
  await expect.poll(() => paused(b), { timeout: 15_000 }).toBe(false)
  await b.waitForTimeout(1600) // passa a janela em que o proprio player ainda pula para o ponto salvo

  for (const [acao, esperado] of [['pause', true], ['play', false]] as const) {
    const t0 = Date.now()
    await video(a).evaluate((v: HTMLVideoElement, f) => (f === 'pause' ? v.pause() : v.play()), acao)
    await expect.poll(() => paused(b), { timeout: 1500 }).toBe(esperado)
    expect(Date.now() - t0).toBeLessThan(1500)
  }
  await video(a).evaluate((v: HTMLVideoElement) => (v.currentTime = 200))
  await expect.poll(() => video(b).evaluate((v: HTMLVideoElement) => Math.round(v.currentTime)), { timeout: 1500 }).toBe(200)

  // B pausa e da play no proprio controle: A acompanha sem trocar de tela.
  await video(b).evaluate((v: HTMLVideoElement) => v.pause())
  await expect.poll(() => paused(a), { timeout: 1500 }).toBe(true)
  await video(b).evaluate((v: HTMLVideoElement) => v.play())
  await expect.poll(() => paused(a), { timeout: 1500 }).toBe(false)
  await a.waitForTimeout(500)
  expect(a.url()).toBe(urlA)
})

test('troca de filme chega no outro aparelho e depois pausa e play seguem valendo', async ({ browser }) => {
  const room = fakeRoom()
  const a = await person(browser, room, 'a')
  const b = await person(browser, room, 'b')
  await join(a, b)
  await a.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await video(a).evaluate((v: HTMLVideoElement) => v.play())
  await expect(b).toHaveURL(/\/watch\/movie\/1\?/)
  await a.evaluate(() => {
    history.pushState({}, '', '/watch/movie/2?ext=mp4&name=Corrida%20Final')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(b).toHaveURL(/\/watch\/movie\/2\?/)
  await expect.poll(() => paused(b)).toBe(false)
  await b.waitForTimeout(1800)
  await video(a).evaluate((v: HTMLVideoElement) => v.pause())
  await expect.poll(() => paused(b), { timeout: 1500 }).toBe(true)
})

// Provedores diferentes enfeitam o nome de outro jeito: ano, tag de qualidade, prefixo de idioma, pontuacao.
test('outro provedor: acha o filme mesmo com ano, tag e prefixo no nome', async ({ browser }) => {
  for (const nome of ['Filme Explosivo (2023)', 'BR - Filme Explosivo [4K]', 'FILME EXPLOSIVO DUBLADO', 'Filme: Explosivo']) {
    const room = fakeRoom()
    const a = await person(browser, room, 'a')
    const b = await person(browser, room, 'b')
    await catalogoLento(b, 0, (n) => (n === 'Filme Explosivo' ? nome : n))
    await join(a, b)
    await a.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
    await video(a).evaluate((v: HTMLVideoElement) => v.play())
    await expect(b, nome).toHaveURL(/\/watch\/movie\/1\?/)
    await expect(b.getByRole('status')).not.toContainText('não tem')
    await a.context().close()
    await b.context().close()
  }
})

const carregar = (p: Page) => p.evaluate(() => (window as any).__carregar())
const aviso = (p: Page, t: string) => p.getByRole('status').filter({ hasText: t })

// Pedido do Chris: o anfitriao ja comecava a ver enquanto o do amigo ainda carregava. Agora a sala espera todo mundo.
test('inicio sincronizado: ninguem toca ate o convidado (rede lenta, outro provedor) carregar', async ({ browser }) => {
  const room = fakeRoom()
  const a = await person(browser, room, 'a')
  const b = await person(browser, room, 'b', {}, true)
  await catalogoLento(b, 0, (n) => (n === 'Filme Explosivo' ? 'BR - Filme Explosivo [4K]' : n))
  await join(a, b)
  await a.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await video(a).evaluate((v: HTMLVideoElement) => v.play())
  await expect(b).toHaveURL(/\/watch\/movie\/1\?/)
  await expect(aviso(a, 'Esperando outra pessoa carregar…')).toBeVisible()
  await expect(aviso(b, 'Carregando para começar juntos…')).toBeVisible()
  // Enquanto o do amigo carrega, o de quem abriu fica parado (antes: tocava sozinho).
  await a.waitForTimeout(2500)
  expect(await paused(a)).toBe(true)
  expect(await paused(b)).toBe(true)

  await carregar(b)
  await expect.poll(() => paused(a)).toBe(false)
  await expect.poll(() => paused(b)).toBe(false)
  await expect(aviso(a, 'Assistindo junto')).toBeVisible()
  const [ta, tb] = await Promise.all([a, b].map((p) => video(p).evaluate((v: HTMLVideoElement) => v.currentTime)))
  expect(Math.abs(ta - tb)).toBeLessThan(2)
})

test('inicio sincronizado: limite de espera, se o amigo travar a sala comeca sozinha', async ({ browser }) => {
  const room = fakeRoom(2500)
  const a = await person(browser, room, 'a')
  const b = await person(browser, room, 'b', {}, true)
  await join(a, b)
  const t0 = Date.now()
  await a.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await video(a).evaluate((v: HTMLVideoElement) => v.play())
  await expect(aviso(a, 'Esperando outra pessoa carregar…')).toBeVisible()
  expect(await paused(a)).toBe(true)
  await expect.poll(() => paused(a), { timeout: 8000 }).toBe(false)
  expect(Date.now() - t0).toBeGreaterThan(2000)
})

test('inicio sincronizado: convidado sem o titulo nao segura a sala', async ({ browser }) => {
  const room = fakeRoom()
  const a = await person(browser, room, 'a')
  const b = await person(browser, room, 'b', {}, true)
  await join(a, b)
  await a.goto('/watch/movie/888888?ext=mp4&name=Titulo%20Que%20Nao%20Existe')
  await video(a).evaluate((v: HTMLVideoElement) => v.play())
  await expect(aviso(b, 'Sua conta não tem «Titulo Que Nao Existe»')).toBeVisible()
  await expect.poll(() => paused(a), { timeout: 5000 }).toBe(false)
})

test('inicio sincronizado: 3 pessoas esperam a mais lenta; quem entra depois segue sem parar os outros', async ({ browser }) => {
  const room = fakeRoom()
  const a = await person(browser, room, 'a')
  const b = await person(browser, room, 'b')
  const c = await person(browser, room, 'c', {}, true)
  await join(a, b)
  await c.goto('/junto')
  const code = (await a.getByTestId('junto-codigo').textContent())!.trim()
  await c.getByLabel('Entrar com um código').fill(code)
  await c.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(c.getByText('3 pessoas na sala.')).toBeVisible()
  await a.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await video(a).evaluate((v: HTMLVideoElement) => v.play())
  await expect(c).toHaveURL(/\/watch\/movie\/1\?/)
  await expect(b).toHaveURL(/\/watch\/movie\/1\?/)
  await a.waitForTimeout(1800)
  expect([await paused(a), await paused(b), await paused(c)]).toEqual([true, true, true])
  await carregar(c)
  for (const p of [a, b, c]) await expect.poll(() => paused(p)).toBe(false)

  // Alguem que entra no meio: segue o titulo e ninguem pausa.
  const d = await person(browser, room, 'd')
  await d.goto('/junto')
  await d.getByLabel('Entrar com um código').fill(code)
  await d.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(d).toHaveURL(/\/watch\/movie\/1\?/)
  await expect.poll(() => paused(d)).toBe(false)
  await a.waitForTimeout(800)
  expect(await paused(a)).toBe(false)
})

const abrirNoApp = (p: Page, url: string) =>
  p.evaluate((u) => {
    history.pushState({}, '', u)
    dispatchEvent(new PopStateEvent('popstate'))
  }, url)

test('saida sincronizada: quem sai do filme (ou troca por outro) tira os amigos; quem entra depois nao e puxado', async ({ browser }) => {
  const room = fakeRoom()
  const a = await person(browser, room, 'a')
  const b = await person(browser, room, 'b')
  await join(a, b)
  await abrirNoApp(a, '/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await video(a).evaluate((v: HTMLVideoElement) => v.play())
  await expect(b).toHaveURL(/\/watch\/movie\/1\?/)
  await expect.poll(() => paused(b)).toBe(false)
  await b.waitForTimeout(1800)

  // A volta ao catalogo: B tambem sai do player.
  await a.getByRole('button', { name: 'Voltar', exact: true }).click()
  await expect(a).not.toHaveURL(/\/watch\//)
  await expect(b).not.toHaveURL(/\/watch\//)
  await a.waitForTimeout(1000)
  await expect(a).not.toHaveURL(/\/watch\//) // B saindo por causa da sala nao puxa A de volta
  expect(room.sent.filter((s) => s.from === 'b' && s.msg.t === 'sair')).toEqual([])

  // A escolhe outro filme: B vai junto (sem passar pelo catalogo), esperando carregar.
  await abrirNoApp(a, '/watch/movie/2?ext=mp4&name=Corrida%20Final')
  await video(a).evaluate((v: HTMLVideoElement) => v.play())
  await expect(b).toHaveURL(/\/watch\/movie\/2\?/)

  // B (convidado) tambem pode sair: A sai junto.
  await b.waitForTimeout(1800)
  await b.getByRole('button', { name: 'Voltar', exact: true }).click()
  await expect(a).not.toHaveURL(/\/watch\//)
})
