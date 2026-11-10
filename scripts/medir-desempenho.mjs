// Mede o custo de abrir o app com um catalogo do tamanho de um provedor real (MOCK_BIG=1 no mock), em perfis de
// aparelho fraco: PC (WebView2 do app do Windows) e TV (user agent Samsung/Tizen, CPU 6x mais lenta).
// Uso: node scripts/medir-desempenho.mjs [--perfil=tv|pc|todos] [--json=arquivo]
// Precisa de: MOCK_BIG=1 node e2e/mock-xtream.mjs, node server/index.js e `npm run build && npx vite preview --port 4173`.
import { chromium } from 'playwright'
import fs from 'node:fs'

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const BASE = arg('base', 'http://localhost:4173')
const PERFIS = {
  pc: { viewport: { width: 1280, height: 800 }, cpu: 4, ua: undefined },
  tv: { viewport: { width: 960, height: 540 }, cpu: 6, ua: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106.1/5.5 TV Safari/537.36' },
}
const alvo = arg('perfil', 'todos')
const creds = { baseUrl: 'http://localhost:8790', username: 'demo', password: 'demo123' }

async function medir(browser, nome, p, rota) {
  const ctx = await browser.newContext({ viewport: p.viewport, userAgent: p.ua, serviceWorkers: 'block' })
  await ctx.addInitScript((c) => {
    const user = { username: c.username, status: 'Active', expDate: null, isTrial: false, activeConnections: '0', maxConnections: '2' }
    localStorage.setItem('iptv-session', JSON.stringify({ state: { credentials: c, user, server: { url: 'localhost', serverName: 'Mock', timezone: 'America/Sao_Paulo' }, sessionWarning: null }, version: 0 }))
    window.__lt = []
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: 'longtask', buffered: true })
  }, creds)
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu })
  let bytes = 0
  cdp.on('Network.loadingFinished', (e) => (bytes += e.encodedDataLength))
  await cdp.send('Network.enable')
  await cdp.send('Performance.enable')
  const t0 = Date.now()
  await page.goto(BASE + rota, { waitUntil: 'commit' })
  await page.waitForSelector('img, [data-row], main button', { timeout: 60000 }).catch(() => {})
  const primeiro = Date.now() - t0
  // Espera o catalogo terminar: some o texto "Carregando ..." ou passam 90 s.
  await page.waitForFunction(() => !/Carregando (filmes|séries|canais)/.test(document.body.innerText), null, { timeout: 90000, polling: 250 }).catch(() => {})
  const completo = Date.now() - t0
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]))
  const lt = await page.evaluate(() => window.__lt)
  const r = {
    perfil: nome, rota,
    primeiroConteudoMs: primeiro, catalogoCompletoMs: completo,
    tarefasLongas: lt.length, bloqueioTotalMs: Math.round(lt.reduce((a, d) => a + Math.max(0, d - 50), 0)),
    maiorTarefaMs: Math.round(Math.max(0, ...lt)),
    scriptMs: Math.round(m.ScriptDuration * 1000), heapMB: +(m.JSHeapUsedSize / 1e6).toFixed(1), nosDom: m.Nodes, kbRede: Math.round(bytes / 1024),
  }
  await ctx.close()
  return r
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const out = []
for (const [nome, p] of Object.entries(PERFIS)) {
  if (alvo !== 'todos' && alvo !== nome) continue
  for (const rota of ['/', '/movies', '/live']) out.push(await medir(browser, nome, p, rota))
}
await browser.close()
console.table(out)
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 2))
