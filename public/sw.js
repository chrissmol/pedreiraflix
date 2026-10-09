// Service worker: makes "Add to Home Screen" behave like a real app on iOS/Android/Windows (instant
// launch, cached app shell) without ever caching anything from the IPTV provider — /api/xtream and
// /api/stream are always live, both because caching a live channel makes no sense and because caching
// video would balloon storage and quickly go stale.
//
// Bump this on any change to the strategy below (not on every deploy — the HTML/JS/CSS themselves are
// versioned by Vite's content-hashed filenames, and the network-first navigation handler below already
// keeps index.html itself fresh on every load with a connection).
const VERSION = 'v3'
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
      await self.clients.claim()
    })(),
  )
})

// ignoreVary: o servidor manda `Vary: Origin`, e o que foi guardado na instalacao (sem Origin) nao batia com o
// pedido da pagina (com Origin) — sem internet o app abria em branco. Seguro aqui: so arquivos do proprio app,
// com nome que muda a cada versao.
const MATCH = { ignoreVary: true }

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch (err) {
    const cached = await caches.match(request, MATCH)
    if (cached) return cached
    const shell = await caches.match('/index.html', MATCH)
    if (shell) return shell
    throw err
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
