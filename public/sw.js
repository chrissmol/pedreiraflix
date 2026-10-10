// Service worker: makes "Add to Home Screen" behave like a real app on iOS/Android/Windows (instant
// launch, cached app shell) without ever caching anything from the IPTV provider — /api/xtream and
// /api/stream are always live, both because caching a live channel makes no sense and because caching
// video would balloon storage and quickly go stale.
//
// Bump this on any change to the strategy below (not on every deploy — the HTML/JS/CSS themselves are
// versioned by Vite's content-hashed filenames, and the network-first navigation handler below already
// keeps index.html itself fresh on every load with a connection).
const VERSION = 'v4'
const RUNTIME_CACHE = `pedreiraflix-${VERSION}`

// No skipWaiting() on install, on purpose: a new worker waits until the page asks it to take over, so an
// update can never swap the app out from under someone who is in the middle of watching something. The
// prompt that asks is UpdatePrompt.tsx — without it, an installed PWA could sit on an old build for days.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// Guarda todas as telas e arquivos do app ja na instalacao (lista gerada no build: precache.json), para o app
// abrir qualquer tela sem internet — inclusive as que nunca foram abertas com internet. Melhor esforco: um
// arquivo que falhar nao impede a instalacao (ele so fica para o cache normal, quando for usado).
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch('/precache.json', { cache: 'no-store' }).catch(() => null)
      if (!res?.ok) return
      const cache = await caches.open(RUNTIME_CACHE)
      await Promise.allSettled((await res.json()).map((url) => cache.add(url)))
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('pedreiraflix-') && k !== RUNTIME_CACHE).map((k) => caches.delete(k)))
      // Cada deploy troca os nomes dos arquivos em /assets/ e os antigos ficavam para sempre no cache (so a troca de
      // VERSION limpava). Fica o que a lista da versao nova conhece; sem a lista, nao apaga nada.
      const list = await fetch('/precache.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      if (list) {
        const keep = new Set(list)
        const cache = await caches.open(RUNTIME_CACHE)
        for (const req of await cache.keys()) {
          const path = new URL(req.url).pathname
          if (path.startsWith('/assets/') && !keep.has(path)) await cache.delete(req)
        }
      }
      await self.clients.claim()
    })(),
  )
})

// ignoreVary: o servidor manda `Vary: Origin`, e o que foi guardado na instalacao (sem Origin) nao batia com o
// pedido da pagina (com Origin) — sem internet o app abria em branco. Seguro aqui: so arquivos do proprio app,
// com nome que muda a cada versao.
const MATCH = { ignoreVary: true }

// Com sinal ruim ("lie-fi": conectado, mas a resposta nao vem) o fetch ficava pendurado ate o tempo limite do
// navegador e o app, aberto pelo icone, parecia travado mesmo com a tela guardada no cache. Havendo copia
// guardada, espera so um pouco pela rede e abre a copia; a resposta tardia ainda atualiza o cache.
const NAV_TIMEOUT_MS = 4000

async function networkFirst(request) {
  const cached = (await caches.match(request, MATCH)) ?? (await caches.match('/index.html', MATCH))
  const network = fetch(request).then((response) => {
    if (response.ok) caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, response.clone()))
    return response
  })
  if (!cached) return network
  network.catch(() => {})
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAV_TIMEOUT_MS))
  try {
    return await Promise.race([network, timeout])
  } catch {
    return cached
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request, MATCH)
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)
  return cached ?? (await networkPromise) ?? Response.error()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Cross-origin (Google Fonts, and above all the IPTV provider itself when a request somehow isn't
  // routed through /api) — never intercept. Only our own same-origin app shell is ours to cache.
  if (url.origin !== self.location.origin) return
  // The proxy: player_api.php calls and every HLS/MP4 byte must always be live, never served stale.
  if (url.pathname.startsWith('/api/')) return

  // Nem todo pedido de pagina chega como 'navigate' (o Chrome mostrou um /watch/... caindo no ramo de baixo
  // e, sem rede, virando Response.error()). Qualquer pedido de HTML ganha o fallback para o app guardado.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request))
    return
  }
  event.respondWith(staleWhileRevalidate(request))
})
