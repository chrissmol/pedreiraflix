import { expect, test, type BrowserContext, type Page, type WebSocketRoute } from '@playwright/test'
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
  Object.defineProperty(proto, 'readyState', { get: () => 4, configurable: true })
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

/** A sala do Worker (worker/junto.js) feita aqui: repassa o estado aos outros, guarda o ultimo e conta as pessoas. */
function fakeRoom() {
  const sockets = new Set<WebSocketRoute>()
  let last: { state: Record<string, unknown>; at: number } | null = null
  const sent: { from: string; msg: Record<string, unknown> }[] = []
  const people = () => sockets.forEach((ws) => ws.send(JSON.stringify({ t: 'pessoas', n: sockets.size })))
  const attach = async (ctx: BrowserContext, name: string) => {
    await ctx.routeWebSocket(/\/api\/junto\//, (ws) => {
      sockets.add(ws)
      if (last) ws.send(JSON.stringify({ t: 'estado', ...last.state, age: Date.now() - last.at }))
      people()
      ws.onMessage((m) => {
        const msg = JSON.parse(String(m))
        sent.push({ from: name, msg })
        last = { state: { path: msg.path, playing: msg.playing, pos: msg.pos }, at: Date.now() }
        for (const other of sockets) if (other !== ws) other.send(JSON.stringify({ ...last.state, t: 'estado', age: 0 }))
      })
      ws.onClose(() => {
        sockets.delete(ws)
        people()
      })
    })
  }
  return { attach, sent }
}

async function person(browser: import('@playwright/test').Browser, room: ReturnType<typeof fakeRoom>, name: string, options = {}) {
  const ctx = await browser.newContext(options)
  await room.attach(ctx, name)
  const page = await ctx.newPage()
  await seedSession(page)
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
  expect(room.sent.filter((s) => s.from === 'b')).toEqual([])

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
  expect(room.sent.at(-1)!.msg).toMatchObject({ playing: true })
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
