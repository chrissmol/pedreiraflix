// Estresse do site no navegador, irma do estressar-apk: painel falso dos testes (e2e/mock-xtream.mjs), proxy e
// Vite locais; passeia por todas as telas como computador, celular e TV, tira uma captura de cada, roda as checagens
// de layout e depois um macaco de cliques/teclas aleatorios. Relatorio em test-results/estresse-web/.
// Uso: `node scripts/estressar-web.mjs [--cliques 150] [--aparelho celular]`.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from 'playwright'
import { auditarLayout } from './auditar-layout.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'test-results/estresse-web')
const BASE = 'http://localhost:5173'
const args = process.argv.slice(2)
const opcao = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null)
const CLIQUES = Number(opcao('--cliques')) || 150
const MOCK = { baseUrl: 'http://localhost:8790', username: 'demo', password: 'demo123' }

const APARELHOS = {
  computador: { contexto: { viewport: { width: 1440, height: 900 } }, toque: false },
  celular: { contexto: { ...devices['Pixel 7'] }, toque: true },
  // Fire TV Stick em 1080p (mesmo do e2e/tv.spec.ts): so setas e OK.
  tv: {
    contexto: {
      viewport: { width: 960, height: 540 },
      userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    },
    toque: false,
    teclas: true,
  },
}
const TELAS = [
  ['login', '/login'],
  ['inicio', '/'],
  ['canais', '/live'],
  ['guia', '/guide'],
  ['filmes', '/movies'],
  ['filme', '/movies/1'],
  ['series', '/series'],
  ['serie', '/series/50'],
  ['busca', '/search?q=filme'],
  ['downloads', '/downloads'],
  ['perfis', '/profiles'],
  ['diagnostico', '/diagnostico'],
  ['player', '/watch/movie/1?ext=mp4&name=Filme%20Explosivo'],
]
// So existe no servidor de desenvolvimento: /api/tmdb e do Worker, e o WebSocket e a recarga do Vite.
const RUIDO_DEV = [/\/api\/tmdb/, /WebSocket connection to 'ws:/, /\[vite\]/, /status of 404 \(Not Found\)/]

const so = opcao('--aparelho')
if (so && !APARELHOS[so]) {
  console.error(`Aparelho desconhecido "${so}". Aparelhos: ${Object.keys(APARELHOS).join(', ')}`)
  process.exit(1)
}

const portaLivre = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.on('connect', () => (s.destroy(), resolve(false)))
    s.on('error', () => resolve(true))
  })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(OUT, { recursive: true })
const filhos = []
const subir = (a, env = {}) => filhos.push(spawn(a[0], a.slice(1), { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'ignore', shell: process.platform === 'win32' }))
// Porta ja ocupada = reaproveita o que estiver rodando (npm run dev, outro teste).
if (await portaLivre(8790)) subir(['node', 'e2e/mock-xtream.mjs'])
if (await portaLivre(8787)) subir(['node', 'server/index.js'], { ALLOW_PRIVATE_HOSTS: '1', STREAM_KEY: 'cGVkcmVpcmFmbGl4LWNoYXZlLWRlLXRlc3RlLTAxMjM=', PORT: '8787' })
if (await portaLivre(5173)) subir(['npx', 'vite', '--port', '5173', '--strictPort'])
const fim = () => filhos.forEach((p) => p.kill())
process.on('exit', fim)
process.on('SIGINT', () => process.exit(130))
for (let i = 0; i < 120 && (await portaLivre(5173)); i++) await sleep(500)

const achados = []
const visual = []
const passos = []
const passo = async (nome, fn) => {
  const t = Date.now()
  try {
    await fn()
    passos.push(`- ok: ${nome} (${Math.round((Date.now() - t) / 1000)}s)`)
  } catch (err) {
    const msg = String(err.message || err).split('\n')[0]
    passos.push(`- FALHOU: ${nome}: ${msg}`)
    achados.push(`Passo "${nome}" falhou: ${msg}`)
  }
  console.log(passos.at(-1))
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
try {
  for (const [aparelho, cfg] of Object.entries(APARELHOS)) {
    if (so && so !== aparelho) continue
    const ctx = await browser.newContext(cfg.contexto)
    const page = await ctx.newPage()
    let offline = false
    const anotar = (a) => {
      if (RUIDO_DEV.some((r) => r.test(a)) || (offline && /ERR_|Failed to fetch|NetworkError/.test(a))) return
      achados.push(`[${aparelho}] ${a}`)
    }
    page.on('pageerror', (e) => anotar(`Erro de JavaScript: ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && anotar(`console.error: ${m.text().slice(0, 200)}`))
    page.on('response', (r) => r.status() >= 400 && anotar(`HTTP ${r.status()}: ${r.url().replace(/[?&](s|p|url)=[^&]*/g, '').slice(0, 160)}`))

    const abrir = async (nome, rota) => {
      await page.goto(BASE + rota)
      await page.locator('#main-content, video, form').first().waitFor({ timeout: 20_000 })
      await sleep(2500)
      // "Carregando" ainda na tela depois de 20s+ de espera e problema, nao paciencia.
      if (await page.getByText(/^Carregando/).first().isVisible().catch(() => false)) visual.push(`[${aparelho}/${nome}] ainda "Carregando..." depois da espera`)
      await page.screenshot({ path: join(OUT, `${aparelho}-${nome}.png`) })
      for (const p of await page.evaluate(auditarLayout, { toque: cfg.toque })) visual.push(`[${aparelho}/${nome}] ${p}`)
    }

    await passo(`${aparelho}: tela de login`, () => abrir('login', '/login'))
    // Sessao de teste direto no armazenamento (mesmo atalho do e2e/helpers.ts seedSession).
    await page.evaluate((creds) => {
      const user = { username: creds.username, status: 'Active', expDate: null, isTrial: false, activeConnections: '0', maxConnections: '2' }
      const server = { url: 'localhost', serverName: 'Mock Panel', timezone: 'America/Sao_Paulo' }
      localStorage.setItem('iptv-session', JSON.stringify({ state: { credentials: creds, user, server, sessionWarning: null }, version: 0 }))
    }, MOCK)
    for (const [nome, rota] of TELAS.slice(1)) await passo(`${aparelho}: ${nome}`, () => abrir(nome, rota))

    await passo(`${aparelho}: sem internet e volta`, async () => {
      await page.goto(BASE + '/')
      await page.locator('#main-content').waitFor()
      offline = true
      await ctx.setOffline(true)
      await sleep(3000)
      await page.screenshot({ path: join(OUT, `${aparelho}-sem-internet.png`) })
      await ctx.setOffline(false)
      await sleep(3000)
      offline = false
    })

    await passo(`${aparelho}: macaco com ${CLIQUES} ${cfg.teclas ? 'teclas' : 'cliques'} aleatorios`, async () => {
      await page.goto(BASE + '/')
      const teclas = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowRight', 'Enter', 'Escape', 'Backspace']
      for (let i = 0; i < CLIQUES; i++) {
        // Botao "Sair" ou rota invalida mandam para o login: volta para dentro e segue.
        if (page.url().includes('/login')) await page.goto(BASE + '/').catch(() => {})
        if (cfg.teclas) {
          await page.keyboard.press(teclas[Math.floor(Math.random() * teclas.length)]).catch(() => {})
        } else {
          const alvos = page.locator('main a:visible, main button:visible, header button:visible, nav a:visible, [role="dialog"] button:visible')
          const n = await alvos.count().catch(() => 0)
          if (n) await alvos.nth(Math.floor(Math.random() * n)).click({ timeout: 2000, noWaitAfter: true }).catch(() => {})
          if (i % 25 === 24) await page.goBack().catch(() => {})
        }
        await sleep(150)
      }
      await page.screenshot({ path: join(OUT, `${aparelho}-depois-do-macaco.png`) })
      if (!(await page.locator('#root').innerText()).trim()) throw new Error('a tela ficou em branco')
    })
    await ctx.close()
  }
} finally {
  await browser.close()
  const relatorio = [
    `# Estresse do site - ${new Date().toLocaleString('pt-BR')}`,
    '',
    '## Passos',
    ...passos,
    '',
    '## Erros',
    ...(achados.length ? [...new Set(achados)].map((a) => `- ${a}`) : ['- nenhum']),
    '',
    '## Layout (checagens automaticas)',
    ...(visual.length ? [...new Set(visual)].map((a) => `- ${a}`) : ['- nenhum']),
    '',
    'Revisao visual das capturas: ver .claude/skills/estressar-web/SKILL.md.',
    '',
    `Capturas em ${OUT}.`,
  ].join('\n')
  writeFileSync(join(OUT, 'relatorio.md'), relatorio)
  console.log(`\n${relatorio}`)
  fim()
  process.exit(achados.length || visual.length ? 1 : 0)
}
