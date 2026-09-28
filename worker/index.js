// Cloudflare Worker: serves the built site (ASSETS) and the same /api proxy as server/index.js.
// SSRF/open-relay protection blocks private/internal addresses (mirrors server/index.js's DNS-based
// check) instead of an ALLOWED_HOSTS allowlist — a fixed host allowlist doesn't work here because a
// real Xtream catalog legitimately hotlinks poster/logo images from many different public hosts (TMDB,
// image hosts, the provider's own CDN...), all decided by the provider, not by us. Video/API calls
// always target the single host the user typed at login, so this is no less safe for those; images
// just needed the same "block internal, allow public" policy dev already had instead of a strict list.

// Workers send no User-Agent by default and Xtream panels commonly answer 404 to that.
const UPSTREAM_HEADERS = { 'user-agent': 'Mozilla/5.0' }

// Applied to every response this Worker returns (site and API alike). No inline <script> exists in the
// build (Vite emits external, hashed <script type="module"> files) other than the ::cue subtitle style
// tag and the Cast SDK's own bootstrap, both covered by 'unsafe-inline'/the gstatic.com allowance below;
// inline `style="..."` attributes are used throughout (React's `style={{...}}` prop, e.g. per-profile
// avatar colors), so style-src needs 'unsafe-inline' too. connect-src/media-src are 'self' plus Google's
// Cast sender origin — video/API calls otherwise go through our own /api/* proxy only, never straight to
// the IPTV provider. www.gstatic.com is the Chromecast sender SDK (lib/cast.ts) — untested against real
// Cast hardware (no device available here), so if casting doesn't work end to end, check the browser
// console for a *different* blocked CSP origin the SDK needs and add it here.
const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self' https://www.gstatic.com",
    // No more fonts.googleapis.com/gstatic.com here: the app dropped its Google-hosted webfonts for each
    // platform's native system font (see index.css) — nothing left that needs those origins.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self' https://www.gstatic.com",
    // blob: is hls.js's own delivery mechanism (MediaSource + a blob: object URL as video.src) for every
    // .m3u8 stream — live channels always go through it, so without this every live channel hung forever
    // ("loading media... violates media-src") while direct-file VOD (mp4/ts) kept working fine.
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=(), microphone=(), camera=(), usb=(), payment=()',
  // No X-Frame-Options: frame-ancestors above already covers it and is the modern replacement.
}

// `run_worker_first: true` (wrangler.jsonc) routes every asset request through this Worker instead of
// letting Cloudflare's edge serve them directly — necessary so the security headers above actually land
// on the page (see the commit that added it), but Cloudflare's default asset headers underneath are
// `Cache-Control: max-age=0, must-revalidate`, which was invisibly making the browser re-validate every
// single JS/CSS file on every load. Vite content-hashes every filename under /assets/ (a changed file
// gets a new URL), so those are safe to cache for a full year with `immutable` — the single biggest,
// purely-mechanical fix available for load time on repeat visits.
function withCacheHeaders(headers, pathname) {
  if (pathname.startsWith('/assets/')) headers.set('cache-control', 'public, max-age=31536000, immutable')
  else if (/\.(?:png|svg|ico)$/.test(pathname)) headers.set('cache-control', 'public, max-age=86400')
}

function withSecurityHeaders(response, pathname) {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v)
  if (pathname) withCacheHeaders(headers, pathname)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

// Self-contained per-IP throttle: no KV/Durable Object binding required, so it works on the free Workers
// plan too. State lives in the isolate's module scope, which Cloudflare keeps warm across many requests
// under normal traffic (not persisted, not shared across edge locations/isolates) — a soft, best-effort
// brake on sustained abuse from one IP, not a hard guarantee. Limits are generous by design: live HLS
// alone can mean several segment requests every few seconds per viewer.
const rateBuckets = new Map()
function isRateLimited(ip, key, limit, windowMs) {
  const now = Date.now()
  // Opportunistic cleanup instead of a timer (Workers don't run background timers outside a request):
  // once the map gets big enough that it's worth the pass, drop anything from an already-closed window.
  if (rateBuckets.size > 5000) {
    for (const [k, b] of rateBuckets) if (now - b.start > windowMs) rateBuckets.delete(k)
  }
  const bucketKey = `${ip}:${key}`
  const bucket = rateBuckets.get(bucketKey)
  if (!bucket || now - bucket.start > windowMs) {
    rateBuckets.set(bucketKey, { start: now, count: 1 })
    return false
  }
  bucket.count++
  return bucket.count > limit
}

// Workers have no synchronous DNS-lookup API like Node's `dns.lookup` (a DNS-over-HTTPS round trip
// before every request would add real latency to every HLS segment/image fetch), so this is a literal
// check on IP-literal hosts only — it can't catch a public-looking hostname that resolves to a private
// IP (DNS rebinding). Acceptable here because every URL this proxy ever fetches comes from the response
// of the Xtream panel the user themselves configured, never from arbitrary third-party/client input.
function isPrivateAddress(hostname) {
  const h = hostname.toLowerCase()
  if (h === 'localhost') return true
  if (h.includes(':')) {
    // IPv6 literal
    return h === '::1' || h === '::' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('::ffff:127.')
  }
  const parts = h.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false // not an IPv4 literal — allow (public hostname)
  const [a, b] = parts
  if (a === 127) return true // loopback
  if (a === 10) return true // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
  if (a === 192 && b === 168) return true // RFC1918
  if (a === 169 && b === 254) return true // link-local incl. cloud metadata
  if (a === 0) return true
  if (a >= 224) return true // multicast/reserved
  return false
}

function isAllowed(url) {
  return (url.protocol === 'http:' || url.protocol === 'https:') && !isPrivateAddress(url.hostname)
}

async function xtream(url) {
  const q = url.searchParams
  let target
  try {
    target = new URL(`${new URL(q.get('base')).origin}/${q.get('path') || 'player_api.php'}`)
  } catch {
    return new Response('invalid base url', { status: 400 })
  }
  if (!isAllowed(target)) return new Response('host not allowed', { status: 403 })
  for (const [k, v] of q) if (k !== 'base' && k !== 'path') target.searchParams.set(k, v)
  try {
    const up = await fetch(target, { headers: UPSTREAM_HEADERS, signal: AbortSignal.timeout(20_000) })
    return new Response(up.body, {
      status: up.status,
      headers: { 'content-type': up.headers.get('content-type') || 'application/json' },
    })
  } catch {
    return Response.json({ error: 'upstream fetch failed' }, { status: 502 })
  }
}

async function stream(request, url) {
  let target
  try {
    target = new URL(url.searchParams.get('url'))
  } catch {
    return new Response('invalid url', { status: 400 })
  }
  if (!isAllowed(target)) return new Response('host not allowed', { status: 403 })

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15_000)
  let up
  try {
    up = await fetch(target, {
      headers: request.headers.has('range')
        ? { ...UPSTREAM_HEADERS, range: request.headers.get('range') }
        : UPSTREAM_HEADERS,
      signal: ctrl.signal,
    })
  } catch (e) {
    const timedOut = e.name === 'AbortError'
    return new Response(timedOut ? 'upstream timed out' : 'upstream fetch failed', { status: timedOut ? 504 : 502 })
  } finally {
    clearTimeout(timer)
  }

  const headers = new Headers()
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = up.headers.get(h)
    // content-length is wrong once the runtime has transparently decompressed the body
    if (v && !(h === 'content-length' && up.headers.get('content-encoding'))) headers.set(h, v)
  }
  if (url.searchParams.get('download') === '1') {
    const name = (url.searchParams.get('filename') || 'download').replace(/[\r\n"]/g, '_')
    headers.set('content-disposition', `attachment; filename="${name}"`)
  }
  // Posters/logos proxied through here (see proxyImage in src/lib/xtream.ts) never carried any caching
  // header, so the browser re-fetched every single poster on every visit — video/HLS explicitly isn't
  // touched here (live in particular must never be cached), only actual image responses.
  if ((headers.get('content-type') || '').startsWith('image/')) headers.set('cache-control', 'public, max-age=604800')

  if ((headers.get('content-type') || '').includes('mpegurl') || target.pathname.endsWith('.m3u8')) {
    // Resolve against the final URL (after redirects) when that host is public too, otherwise keep the
    // original host (which re-redirects). Also rewrite URI="..." attributes (alt audio, subtitles, keys).
    const base = up.url && isAllowed(new URL(up.url)) ? up.url : target.toString()
    const proxied = (ref) => `/api/stream?url=${encodeURIComponent(new URL(ref, base).toString())}`
    const text = (await up.text())
      .split('\n')
      .map((line) => {
        const t = line.trim()
        if (!t) return line
        if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, ref) => `URI="${proxied(ref)}"`)
        return proxied(t)
      })
      .join('\n')
    headers.set('content-type', 'application/vnd.apple.mpegurl')
    headers.delete('content-length')
    return new Response(text, { status: up.status, headers })
  }
  return new Response(up.body, { status: up.status, headers })
}

// Client-side error reporting: no Sentry/analytics account exists for this project, so instead of
// silently losing every crash a real user hits (the only way to learn about one used to be Christian
// noticing and describing it), the frontend POSTs uncaught errors/rejections/render crashes here (see
// src/lib/errorReporting.ts) and this just logs them with `console.error` — visible live with
// `wrangler tail` (or in the dashboard's Logs tab) without needing a third-party account or API key. It's
// not a real observability stack (no retention, no alerting, no dashboards), but it's a genuine step up
// from "no signal at all", and swapping in a real error-tracking service later only means changing this
// one function, not the frontend's reporting call site.
async function logError(request) {
  let body
  try {
    // Hard cap so a malicious/broken client can't use this as a free storage/log-flooding endpoint.
    const text = await request.text()
    if (text.length > 8_000) return new Response('payload too large', { status: 413 })
    body = JSON.parse(text)
  } catch {
    return new Response('invalid json', { status: 400 })
  }
  const { kind, message, stack, url: pageUrl, userAgent } = body || {}
  if (typeof message !== 'string' || !message) return new Response('missing message', { status: 400 })
  console.error(
    JSON.stringify({
      source: 'client',
      kind: typeof kind === 'string' ? kind.slice(0, 40) : 'error',
      message: message.slice(0, 500),
      stack: typeof stack === 'string' ? stack.slice(0, 2000) : undefined,
      url: typeof pageUrl === 'string' ? pageUrl.slice(0, 300) : undefined,
      userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 200) : undefined,
      ts: new Date().toISOString(),
    }),
  )
  return new Response(null, { status: 204 })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    // CF-Connecting-IP is set by Cloudflare's edge itself, not forwardable by a client — safe to trust.
    const ip = request.headers.get('cf-connecting-ip') || 'unknown'

    if (url.pathname === '/api/log-error' && request.method === 'POST') {
      // Errors can legitimately come in bursts (one crash often triggers several related ones) — capped
      // low enough to still block someone trying to use this as a flood/spam vector.
      if (isRateLimited(ip, 'log-error', 20, 10_000)) return withSecurityHeaders(new Response(null, { status: 429 }))
      return withSecurityHeaders(await logError(request))
    }
    if (url.pathname === '/api/xtream') {
      // Catalog/EPG/login calls: normal browsing is a handful of these at a time, not a sustained burst.
      if (isRateLimited(ip, 'xtream', 300, 10_000)) return withSecurityHeaders(new Response('rate limited', { status: 429 }))
      return withSecurityHeaders(await xtream(url))
    }
    if (url.pathname === '/api/stream') {
      // Media/segments: generous — one viewer can easily fire off a dozen HLS segment/key/subtitle
      // requests within a few seconds, especially right after a channel switch or quality change.
      if (isRateLimited(ip, 'stream', 600, 10_000)) return withSecurityHeaders(new Response('rate limited', { status: 429 }))
      return withSecurityHeaders(await stream(request, url))
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request), url.pathname)
  },
}
