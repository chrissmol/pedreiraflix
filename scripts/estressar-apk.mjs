// Estresse do app Android num emulador: APK de teste apontando para o site local com o painel falso dos
// testes (e2e/mock-xtream.mjs), logado com a conta de teste, passeando pelo app, macaco de toques aleatorios e
// eventos do sistema (girar, segundo plano, sem internet, voltar, memoria baixa). Relatorio em
// test-results/estresse-apk/. Uso: `node scripts/estressar-apk.mjs [--sem-build] [--eventos 3000]`.
// Pre-requisitos (Mac do Christian): JDK em ~/.local/jdk, Android SDK + emulador (AVD pf36) em ~/.local/android.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { _android } from 'playwright'

const HOME = homedir()
const ANDROID_HOME = process.env.ANDROID_HOME || join(HOME, '.local/android')
const JAVA_HOME = process.env.JAVA_HOME || join(HOME, '.local/jdk')
const ENV = {
  ...process.env,
  ANDROID_HOME,
  JAVA_HOME,
  PATH: [join(ANDROID_HOME, 'platform-tools'), join(ANDROID_HOME, 'emulator'), join(JAVA_HOME, 'bin'), process.env.PATH].join(':'),
}
const ROOT = new URL('..', import.meta.url).pathname
const OUT = join(ROOT, 'test-results/estresse-apk')
const PKG = 'com.pedreiraflix.app.teste'
const ACTIVITY = `${PKG}/com.pedreiraflix.app.MainActivity`
const args = process.argv.slice(2)
const EVENTOS = Number(args[args.indexOf('--eventos') + 1]) || 3000
// Mesmas credenciais de teste do e2e (e2e/helpers.ts) — o painel falso roda no Mac; o proxy do site (tambem no
// Mac) alcanca o painel por localhost.
const MOCK = { baseUrl: 'http://localhost:8790', username: 'demo', password: 'demo123' }

const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { env: ENV, encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], ...opts })
const adb = (...a) => sh('adb', a, { timeout: 120_000 }).trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const portaLivre = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.on('connect', () => (s.destroy(), resolve(false)))
    s.on('error', () => resolve(true))
  })

// Ruido que so existe no servidor local de desenvolvimento, nao no app publicado: o dev nao tem /api/tmdb (so o
// Worker tem) e a recarga automatica do Vite (WebSocket) nao alcanca o emulador.
const RUIDO_DEV = [/\/api\/tmdb/, /WebSocket connection to 'ws:/, /status of 404 \(Not Found\)/]
const achados = []
const visual = []
let semInternet = false // erros de rede durante o passo "sem internet" sao esperados
const anotar = (a) => RUIDO_DEV.some((r) => r.test(a)) || (semInternet && /ERR_|Failed to fetch|NetworkError/.test(a)) || achados.push(a)
const passos = []
const passo = async (nome, fn) => {
  const t = Date.now()
  try {
    await fn()
    passos.push(`- ok — ${nome} (${Math.round((Date.now() - t) / 1000)}s)`)
  } catch (err) {
    passos.push(`- FALHOU — ${nome}: ${String(err.message || err).split('\n')[0]}`)
    achados.push(`Passo "${nome}" falhou: ${String(err.message || err).split('\n')[0]}`)
  }
  console.log(passos.at(-1))
}

mkdirSync(OUT, { recursive: true })
const filhos = []

// 1. Servidores locais (painel falso, proxy, site). A pre-visualizacao do app Claude sobe o proxy SEM
// ALLOW_PRIVATE_HOSTS e bloquearia o painel falso: precisa estar desligada.
if (!(await portaLivre(8787))) {
  console.error('Porta 8787 ocupada (pre-visualizacao ou npm run dev?). Desligue antes de rodar o estresse.')
  process.exit(1)
}
const subir = (cmd, a, env = {}) => {
  const p = spawn(cmd, a, { cwd: ROOT, env: { ...ENV, ...env }, stdio: 'ignore' })
  filhos.push(p)
}
if (await portaLivre(8790)) subir('node', ['e2e/mock-xtream.mjs'])
subir('node', ['server/index.js'], { ALLOW_PRIVATE_HOSTS: '1', STREAM_KEY: 'CIJftNzU3hhiG9CV99+iGV4xVn3CMuMWqOizVT0m2Z0=', PORT: '8787' })
if (await portaLivre(5173)) subir('npx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'])
const fim = () => filhos.forEach((p) => p.kill())
process.on('exit', fim)
process.on('SIGINT', () => process.exit(130))

try {
  // 2. Emulador
  await passo('emulador ligado', async () => {
    if (!adb('devices').includes('\tdevice')) {
      spawn('emulator', ['-avd', 'pf36', '-no-audio', '-no-boot-anim'], { env: ENV, stdio: 'ignore', detached: true }).unref()
      adb('wait-for-device')
    }
    for (let i = 0; i < 90 && adb('shell', 'getprop', 'sys.boot_completed') !== '1'; i++) await sleep(4000)
  })

  // 3. APK de teste
  if (!args.includes('--sem-build')) {
    await passo('APK de teste gerado e instalado', async () => {
      sh('npx', ['cap', 'sync', 'android'], { env: { ...ENV, PEDREIRAFLIX_TEST_URL: 'http://10.0.2.2:5173' } })
      sh('./gradlew', ['assembleDebug', '-q', '--no-daemon'], { cwd: join(ROOT, 'android'), timeout: 900_000 })
      adb('install', '-r', join(ROOT, 'android/app/build/outputs/apk/debug/app-debug.apk'))
      // Deixa a configuracao de producao de volta no projeto (o APK de verdade nao pode apontar para o Mac).
      sh('npx', ['cap', 'sync', 'android'])
    })
  }

  for (let i = 0; i < 40; i++) if (!(await portaLivre(5173))) break; else await sleep(500)
  adb('logcat', '-c')
  adb('shell', 'am', 'force-stop', PKG)
  adb('shell', 'am', 'start', '-W', '-n', ACTIVITY)

  // 4. Entrar e passear pelo app, de olho em erros do JavaScript
  const [device] = await _android.devices()
  const webview = await device.webView({ pkg: PKG })
  const page = await webview.page()
  page.on('pageerror', (e) => anotar(`Erro de JavaScript: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && anotar(`console.error: ${m.text().slice(0, 200)}`))
  page.on('response', (r) => r.status() >= 400 && anotar(`HTTP ${r.status()}: ${r.url().replace(/[?&](s|p|url)=[^&]*/g, '').slice(0, 160)}`))
  // A tela do emulador demora a refletir a pagina: sem a pausa a captura saia com a tela anterior.
  const foto = async (n) => (await sleep(1500), device.screenshot({ path: join(OUT, `${n}.png`) }))

  // Checagens de layout em cada tela — nao so erros: coisas cortadas, fora da tela, enfeites do provedor,
  // barra de rolagem no toque, alvo pequeno demais para o dedo, titulo por cima do cabecalho.
  const auditar = async (tela) => {
    const problemas = await page.evaluate(() => {
      const out = []
      const W = innerWidth
      const visivel = (el) => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        // > 2px: o link "Pular para o conteudo" (sr-only) fica com 1x1 de proposito ate receber foco.
        return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
      }
      // Dentro de fileira que rola para o lado, ficar fora da tela e normal.
      const emRolagemLateral = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX
          if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth) return true
        }
        return false
      }
      const nome = (el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
      const main = document.getElementById('main-content')
      if (document.documentElement.scrollWidth > W + 1 || (main && main.scrollWidth > main.clientWidth + 1)) out.push('a pagina rola para o lado')
      if (main && main.offsetWidth - main.clientWidth > 0) out.push(`barra de rolagem vertical visivel (${main.offsetWidth - main.clientWidth}px) numa tela de toque`)
      for (const el of document.querySelectorAll('header *, nav *, h1, h2, button, a, input')) {
        if (!visivel(el) || emRolagemLateral(el)) continue
        const r = el.getBoundingClientRect()
        if (r.right > W + 1 || r.left < -1) out.push(`"${nome(el)}" sai da tela (${Math.round(r.left)}..${Math.round(r.right)} de ${W}px)`)
        if (el.matches('button, a, input') && (r.width < 32 || r.height < 32)) out.push(`alvo pequeno para o dedo: "${nome(el)}" ${Math.round(r.width)}x${Math.round(r.height)}px`)
      }
      const cab = document.querySelector('header')?.getBoundingClientRect()
      for (const h of document.querySelectorAll('h1, h2')) {
        if (!cab || !visivel(h)) continue
        const r = h.getBoundingClientRect()
        if (r.top < cab.bottom - 4 && r.bottom > cab.top && document.querySelector('#main-content')?.scrollTop === 0) out.push(`titulo "${nome(h)}" por baixo do cabecalho`)
      }
      for (const el of document.querySelectorAll('h1, h2, h3, button, a, p, span')) {
        if (!visivel(el) || el.children.length) continue
        const t = el.textContent.trim()
        if (/\[[A-Z0-9 +]{1,8}\]|[★⚽]\s*[A-ZÀ-Ú]{3,}|\((\d{4})\)\s*\(\1\)/.test(t)) out.push(`enfeite do provedor aparecendo: "${t.slice(0, 50)}"`)
      }
      return [...new Set(out)].slice(0, 15)
    })
    for (const p of problemas) visual.push(`[${tela}] ${p}`)
  }

  await passo('entrar com a conta de teste', async () => {
    await page.evaluate((creds) => {
      const user = { username: creds.username, status: 'Active', expDate: null, isTrial: false, activeConnections: '0', maxConnections: '2' }
      const server = { url: 'localhost', serverName: 'Mock Panel', timezone: 'America/Sao_Paulo' }
      localStorage.setItem('iptv-session', JSON.stringify({ state: { credentials: creds, user, server, sessionWarning: null }, version: 0 }))
    }, MOCK)
    await page.goto('http://10.0.2.2:5173/')
    await page.getByRole('heading', { name: /Adicionados recentemente|Continuar assistindo|Ação/ }).first().waitFor({ timeout: 30_000 })
    await foto('01-inicio')
    await auditar('inicio')
  })
  const rotas = [
    // So o titulo: a tela de canais pode abrir em "Recentes" (o macaco de uma rodada anterior abre canais).
    ['canais', '/live', 'Canais ao vivo'],
    ['filmes', '/movies', 'Ação'],
    ['filme', '/movies/1', 'Filme Explosivo'],
    ['serie', '/series/50', 'Série Dramática'],
    ['busca', '/search?q=filme', 'Filme Explosivo'],
  ]
  for (const [nome, rota, texto] of rotas) {
    await passo(`abrir ${nome}`, async () => {
      await page.goto(`http://10.0.2.2:5173${rota}`)
      await page.getByText(texto).first().waitFor({ timeout: 20_000 })
      await foto(`02-${nome}`)
      await auditar(nome)
    })
  }
  await passo('tocar um filme por 10s', async () => {
    await page.goto('http://10.0.2.2:5173/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
    await page.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 2, null, { timeout: 30_000 })
    await sleep(8000)
    await foto('03-player')
    await auditar('player')
  })
  await page.goto('http://10.0.2.2:5173/')

  // 5. Macaco logado + eventos do sistema
  await passo(`macaco: ${EVENTOS} toques e gestos aleatorios`, async () => {
    const saida = adb('shell', 'monkey', '-p', PKG, '--pct-syskeys', '0', '--throttle', '25', '-s', String(Date.now() % 100000), '-v', String(EVENTOS))
    if (/CRASH|ANR|aborted/.test(saida)) throw new Error(saida.split('\n').find((l) => /CRASH|ANR|aborted/.test(l)))
  })
  await passo('girar a tela 6x', async () => {
    adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
    for (const r of [1, 0, 1, 0, 1, 0]) (adb('shell', 'settings', 'put', 'system', 'user_rotation', String(r)), await sleep(1500))
  })
  await passo('segundo plano e volta 5x', async () => {
    for (let i = 0; i < 5; i++) (adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'), await sleep(1000), adb('shell', 'am', 'start', '-n', ACTIVITY), await sleep(1500))
  })
  await passo('sem internet e volta', async () => {
    semInternet = true
    adb('shell', 'svc', 'wifi', 'disable')
    adb('shell', 'svc', 'data', 'disable')
    await sleep(4000)
    await foto('04-sem-internet')
    adb('shell', 'svc', 'wifi', 'enable')
    adb('shell', 'svc', 'data', 'enable')
    await sleep(6000)
    semInternet = false
  })
  await passo('botao voltar 10x', async () => {
    for (let i = 0; i < 10; i++) (adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'), await sleep(400))
  })
  await passo('memoria baixa', async () => adb('shell', 'am', 'send-trim-memory', PKG, 'RUNNING_CRITICAL'))
  await passo('app continua vivo', async () => {
    if (!adb('shell', 'pidof', PKG)) throw new Error('o processo do app morreu')
  })

  // 6. Log do Android
  const log = adb('logcat', '-d')
  for (const l of log.split('\n')) if (/FATAL EXCEPTION|ANR in .*pedreiraflix|Fatal signal|Process: com\.pedreiraflix/.test(l)) achados.push(`logcat: ${l.trim()}`)
  writeFileSync(join(OUT, 'logcat.txt'), log)
} finally {
  const relatorio = [
    `# Estresse do APK — ${new Date().toLocaleString('pt-BR')}`,
    '',
    '## Passos',
    ...passos,
    '',
    '## Erros e travamentos',
    ...(achados.length ? [...new Set(achados)].map((a) => `- ${a}`) : ['- nenhum']),
    '',
    '## Layout (checagens automaticas)',
    ...(visual.length ? [...new Set(visual)].map((a) => `- ${a}`) : ['- nenhum']),
    '',
    'Revisao visual das capturas: ver .claude/skills/estressar-apk/SKILL.md.',
    '',
    `Capturas e logcat completo em ${OUT}.`,
  ].join('\n')
  writeFileSync(join(OUT, 'relatorio.md'), relatorio)
  console.log(`\n${relatorio}`)
  fim()
  process.exit(achados.length || visual.length ? 1 : 0)
}
