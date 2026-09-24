// Service worker: makes "Add to Home Screen" behave like a real app on iOS/Android/Windows (instant
// launch, cached app shell) without ever caching anything from the IPTV provider — /api/xtream and
// /api/stream are always live, both because caching a live channel makes no sense and because caching
// video would balloon storage and quickly go stale.
//
// Bump this on any change to the strategy below (not on every deploy — the HTML/JS/CSS themselves are
// versioned by Vite's content-hashed filenames, and the network-first navigation handler below already
// keeps index.html itself fresh on every load with a connection).
const VERSION = 'v1'
const RUNTIME_CACHE = `pedreiraflix-${VERSION}`

self.addEventListener('install', () => {
  self.skipWaiting()
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

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch (err) {
    const cached = await caches.match(request)
    if (cached) return cached
    const shell = await caches.match('/index.html')
    if (shell) return shell
    throw err
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request)
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

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }
  event.respondWith(staleWhileRevalidate(request))
})
