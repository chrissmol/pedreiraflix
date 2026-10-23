// Confere o site publicado sem login e sem segredo: pagina, headers de seguranca, PWA, cache dos assets, protecao
// do proxy e se os secrets STREAM_KEY e TMDB_TOKEN existem (pelo comportamento, nunca pelo valor).
// Uso: `node scripts/checar-producao.mjs [url]` (padrao: o site de producao). Sai com erro se algo falhar.
const BASE = (process.argv[2] || 'https://pedreiraflix.chrisouzamol.workers.dev').replace(/\/$/, '')
const resultados = []

async function checar(nome, fn) {
  try {
    const obs = await fn()
    resultados.push({ ok: true, nome, obs })
  } catch (e) {
    resultados.push({ ok: false, nome, obs: e.message })
  }
}
const get = (path, init) => fetch(BASE + path, { redirect: 'manual', signal: AbortSignal.timeout(20_000), ...init })
function exige(cond, msg) {
  if (!cond) throw new Error(msg)
}

let html = ''
await checar('pagina inicial abre', async () => {
  const r = await get('/')
  html = await r.text()
  exige(r.status === 200, `status ${r.status}`)
  exige(html.includes('id="root"'), 'HTML sem <div id="root">')
})

await checar('headers de seguranca', async () => {
  const h = (await get('/')).headers
  const csp = h.get('content-security-policy') || ''
  for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "media-src 'self' blob:"]) exige(csp.includes(d), `CSP sem ${d}`)
  exige(h.get('x-content-type-options') === 'nosniff', 'sem x-content-type-options: nosniff')
  exige(h.get('referrer-policy'), 'sem referrer-policy')
  exige(h.get('permissions-policy'), 'sem permissions-policy')
})

await checar('assets carregam com cache de 1 ano', async () => {
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
  exige(assets.length, 'nenhum /assets/ no HTML')
  for (const a of assets) {
    const r = await get(a)
    exige(r.status === 200, `${a}: status ${r.status}`)
    exige((r.headers.get('cache-control') || '').includes('immutable'), `${a}: sem cache immutable`)
  }
  return `${assets.length} arquivos`
})

await checar('rota do app (SPA) devolve a pagina', async () => {
  const r = await get('/movies')
  exige(r.status === 200 && (await r.text()).includes('id="root"'), `status ${r.status}`)
})

await checar('PWA: manifest, icones e service worker', async () => {
  const m = await (await get('/manifest.webmanifest')).json()
  exige(m.name && m.start_url, 'manifest sem name/start_url')
  for (const i of m.icons) exige((await get(i.src)).status === 200, `icone ${i.src} fora do ar`)
  const sw = await get('/sw.js')
  exige(sw.status === 200 && (sw.headers.get('content-type') || '').includes('javascript'), `sw.js: status ${sw.status}`)
})

await checar('proxy bloqueia endereco interno', async () => {
  const r = await get('/api/stream?url=' + encodeURIComponent('http://127.0.0.1/'))
  // 401 = nem chegou no proxy: o codigo do grupo (GROUP_CODE) barrou antes, o que tambem protege.
  exige(r.status === 403 || r.status === 401, `esperava 403 ou 401, veio ${r.status}`)
  return r.status === 401 ? 'barrado pelo codigo do grupo' : undefined
})

await checar('secret STREAM_KEY configurado', async () => {
  // Credencial falsa: /api/session so cifra, nao chama o provedor. 204 = Worker sem chave.
  const body = JSON.stringify({ base: 'https://example.com', username: 'checar', password: 'checar' })
  const r = await get('/api/session', { method: 'POST', body, headers: { 'content-type': 'application/json' } })
  // 401: o codigo do grupo barrou antes, entao nao da para conferir a chave daqui (sem segredo nenhum no script).
  if (r.status === 401) return 'nao conferido: atras do codigo do grupo'
  exige(r.status === 200, r.status === 204 ? 'Worker sem STREAM_KEY (videos sem URL cifrada)' : `status ${r.status}`)
})

await checar('codigo do grupo ligado', async () => {
  const s = await (await get('/api/grupo')).json()
  exige(s.required, 'Worker sem GROUP_CODE: qualquer pessoa usa o proxy')
})

await checar('secret TMDB_TOKEN configurado', async () => {
  const r = await get('/api/tmdb?title=Matrix&year=1999')
  const why = r.headers.get('x-tmdb')
  exige(why !== 'no-token', 'Worker sem TMDB_TOKEN')
  exige(r.status < 500, `status ${r.status}${why ? ` (${why})` : ''}`)
  return why ? `sem dados: ${why}` : `status ${r.status}`
})

for (const r of resultados) console.log(`${r.ok ? 'OK    ' : 'FALHOU'} ${r.nome}${r.obs ? ` - ${r.obs}` : ''}`)
const falhas = resultados.filter((r) => !r.ok).length
console.log(`\n${BASE}: ${resultados.length - falhas} ok, ${falhas} falharam`)
process.exit(falhas ? 1 : 0)
