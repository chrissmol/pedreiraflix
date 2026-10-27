// Roda todos os testes do PedreiraFlix e separa o resultado por pilar do app. Uma unica execucao do Playwright
// (cada execucao sobe painel falso, proxy, Vite e um build do PWA; rodar por pilar repetiria isso tudo).
// Uso: `node scripts/testar-tudo.mjs [--pilar player] [--sem-e2e]`. Relatorio em test-results/testar-tudo/.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'test-results/testar-tudo')
const args = process.argv.slice(2)
const so = args.includes('--pilar') ? args[args.indexOf('--pilar') + 1] : null

// Todo spec novo em e2e/ tem que entrar num pilar daqui; o script falha se algum ficar de fora.
const PILARES = {
  player: 'Player, HLS, Cast e AirPlay',
  'ao-vivo': 'TV ao vivo, canais e guia',
  catalogo: 'Filmes, series, busca e TMDB',
  conta: 'Login, contas, perfis, PIN e parental',
  downloads: 'Downloads, offline e ZIP',
  pwa: 'PWA, instalar e atualizar',
  proxy: 'Proxy/Worker, seguranca e erros do provedor',
  telas: 'Celular, iPhone, TV e acessibilidade',
}
const SPECS = {
  player: ['smoke', 'player', 'voz-tv', 'player-recursos', 'airplay', 'cast-airplay', 'live-fast-mode', 'live-travado-safari', 'live-queda-sinal', 'libera-conexao'],
  'ao-vivo': ['live-epg', 'live-404', 'canal-bloqueado', 'canais-grupos', 'canais-grupos.mobile', 'epg', 'epg-manual', 'xmltv', 'xmltv-real', 'relogio', 'zap.mobile'],
  catalogo: ['busca-grande', 'busca-pessoa', 'titulos-duplicados', 'concluido', 'visto-e-em-alta', 'continuar-tv', 'search-suggestions', 'serie-detalhe', 'titulos', 'titulo-removido', 'tmdb', 'ia-gratis', 'ia-gratis.mobile', 'hero', 'grade-progressiva', 'scroll-restore', 'cache', 'prioridade', 'perf', 'erro-tentar'],
  conta: ['auth', 'autologout', 'app-pin', 'account-label-profile-name', 'profiles', 'parental', 'credenciais', 'm3u-login', 'conexoes', 'limite-telas', 'trocar-conta', 'trocar-conta.mobile', 'provedores-fora-do-padrao'],
  downloads: ['downloads', 'downloads-erros', 'downloads-partes', 'baixar-temporada', 'fila-para-no-403', 'serie-zip', 'sem-internet'],
  pwa: ['pwa.pwa', 'pwa-css', 'entrar-offline.pwa', 'instalar-app', 'update-prompt', 'fonte-propria'],
  proxy: ['security', 'respeita-429', 'diagnostico', 'error-reporting', 'suporte'],
  telas: ['a11y', 'achados-estresse.mobile', 'ajustes-visuais.mobile', 'altura-iphone.mobile', 'iphone-shell', 'login-cabe.mobile', 'ui-mobile', 'foco-tv', 'navegacao-tv', 'tv', 'plataformas', 'lighthouse-login', 'anel'],
}

const pilarDe = Object.fromEntries(Object.entries(SPECS).flatMap(([p, l]) => l.map((s) => [`${s}.spec.ts`, p])))
const semPilar = readdirSync(join(ROOT, 'e2e')).filter((f) => f.endsWith('.spec.ts') && !pilarDe[f])
if (semPilar.length) {
  console.error(`Specs sem pilar em scripts/testar-tudo.mjs: ${semPilar.join(', ')}`)
  process.exit(1)
}
if (so && !SPECS[so]) {
  console.error(`Pilar desconhecido "${so}". Pilares: ${Object.keys(SPECS).join(', ')}`)
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })
const run = (cmd, env = {}) => {
  console.log(`\n> ${cmd}`)
  const t = Date.now()
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'inherit', env: { ...process.env, ...env } })
  return { cmd, ok: r.status === 0, s: Math.round((Date.now() - t) / 1000) }
}

const base = so ? [] : ['npm run lint', 'npm run build', 'npm run test:proxy', 'npm run test:worker'].map((c) => run(c))

const json = join(OUT, 'playwright.json')
let e2e = null
if (!args.includes('--sem-e2e')) {
  const files = so ? SPECS[so].map((s) => `e2e/${s}.spec.ts`).join(' ') : ''
  e2e = run(`npx playwright test ${files} --reporter=list,json`, { PLAYWRIGHT_JSON_OUTPUT_NAME: json })
}

const porPilar = Object.fromEntries(Object.keys(SPECS).map((p) => [p, { ok: 0, pulou: 0, falhou: [] }]))
if (e2e && existsSync(json)) {
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      const p = porPilar[pilarDe[spec.file.split(/[\\/]/).pop()]]
      if (spec.tests.every((t) => t.status === 'skipped')) p.pulou++
      else if (spec.ok) p.ok++
      else p.falhou.push(`${spec.file} › ${spec.title}`)
    }
    for (const s of suite.suites ?? []) walk(s)
  }
  for (const s of JSON.parse(readFileSync(json, 'utf8')).suites ?? []) walk(s)
}

const linhas = ['# Testar tudo', '', `Data: ${new Date().toISOString()}${so ? ` · so o pilar ${so}` : ''}`, '']
if (base.length) linhas.push('## Checagens gerais', '', ...base.map((b) => `- ${b.ok ? 'OK' : 'FALHOU'} \`${b.cmd}\` (${b.s}s)`), '')
if (e2e) {
  linhas.push('## E2E por pilar', '', '| Pilar | Passou | Falhou | Pulou |', '|---|---|---|---|')
  for (const [p, r] of Object.entries(porPilar)) if (!so || p === so) linhas.push(`| ${PILARES[p]} | ${r.ok} | ${r.falhou.length} | ${r.pulou} |`)
  const falhas = Object.entries(porPilar).filter(([, r]) => r.falhou.length)
  if (falhas.length) linhas.push('', '## Falhas', '', ...falhas.flatMap(([p, r]) => [`### ${PILARES[p]}`, ...r.falhou.map((f) => `- ${f}`), '']))
  if (!e2e.ok && !falhas.length) linhas.push('', 'O Playwright falhou antes de rodar os testes (servidores, build ou navegador). Veja a saida acima.')
}
writeFileSync(join(OUT, 'relatorio.md'), linhas.join('\n') + '\n')
console.log(`\n${linhas.join('\n')}\nRelatorio: test-results/testar-tudo/relatorio.md`)
process.exit([...base, e2e].every((r) => !r || r.ok) ? 0 : 1)
