// Cloudflare Worker: serves the built site (ASSETS) and the same /api proxy as server/index.js.
// SSRF/open-relay protection is an allowlist (secret ALLOWED_HOSTS, comma-separated) instead of DNS checks.

// Workers send no User-Agent by default and Xtream panels commonly answer 404 to that.
const UPSTREAM_HEADERS = { 'user-agent': 'Mozilla/5.0' }

// Applied to every response this Worker returns (site and API alike). No inline <script> exists in the
// build (Vite emits external, hashed <script type="module"> files), so script-src stays strict; inline
// `style="..."` attributes are used throughout (React's `style={{...}}` prop, e.g. per-profile avatar
// colors), so style-src needs 'unsafe-inline'. connect-src/media-src are 'self' only because video and
// every API call already go through our own /api/* proxy, never straight to the IPTV provider's origin.
const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self'",
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

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v)
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

function isAllowed(env, url) {
  const hosts = (env.ALLOWED_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
  return (url.protocol === 'http:' || url.protocol === 'https:') && hosts.includes(url.hostname.toLowerCase())
}

async function xtream(url, env) {
  const q = url.searchParams
  let target
  try {
    target = new URL(`${new URL(q.get('base')).origin}/${q.get('path') || 'player_api.php'}`)
  } catch {
    return new Response('invalid base url', { status: 400 })
  }
  if (!isAllowed(env, target)) return new Response('host not allowed', { status: 403 })
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

async function stream(request, url, env) {
  let target
  try {
    target = new URL(url.searchParams.get('url'))
  } catch {
    return new Response('invalid url', { status: 400 })
  }
  if (!isAllowed(env, target)) return new Response('host not allowed', { status: 403 })

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

  if ((headers.get('content-type') || '').includes('mpegurl') || target.pathname.endsWith('.m3u8')) {
    // Resolve against the final URL (after redirects) when that host is allowlisted too, otherwise keep the
    // original host (which re-redirects). Also rewrite URI="..." attributes (alt audio, subtitles, keys).
    const base = up.url && isAllowed(env, new URL(up.url)) ? up.url : target.toString()
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    // CF-Connecting-IP is set by Cloudflare's edge itself, not forwardable by a client — safe to trust.
    const ip = request.headers.get('cf-connecting-ip') || 'unknown'

    if (url.pathname === '/api/xtream') {
      // Catalog/EPG/login calls: normal browsing is a handful of these at a time, not a sustained burst.
      if (isRateLimited(ip, 'xtream', 300, 10_000)) return withSecurityHeaders(new Response('rate limited', { status: 429 }))
      return withSecurityHeaders(await xtream(url, env))
    }
    if (url.pathname === '/api/stream') {
      // Media/segments: generous — one viewer can easily fire off a dozen HLS segment/key/subtitle
      // requests within a few seconds, especially right after a channel switch or quality change.
      if (isRateLimited(ip, 'stream', 600, 10_000)) return withSecurityHeaders(new Response('rate limited', { status: 429 }))
      return withSecurityHeaders(await stream(request, url, env))
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request))
  },
}
