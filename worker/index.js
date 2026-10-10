// Cloudflare Worker: serves the built site (ASSETS) and the same /api proxy as server/index.js.
// SSRF/open-relay protection blocks private/internal addresses (mirrors server/index.js's DNS-based
// check) instead of an ALLOWED_HOSTS allowlist — a fixed host allowlist doesn't work here because a
// real Xtream catalog legitimately hotlinks poster/logo images from many different public hosts (TMDB,
// image hosts, the provider's own CDN...), all decided by the provider, not by us. Video/API calls
// always target the single host the user typed at login, so this is no less safe for those; images
// just needed the same "block internal, allow public" policy dev already had instead of a strict list.

import { openSession, proxiedRef, sealSession, targetFor } from './streamSession.js'

// Workers send no User-Agent by default and Xtream panels commonly answer 404 to that.
const UPSTREAM_HEADERS = { 'user-agent': 'Mozilla/5.0' }

// Applied to every response this Worker returns (site and API alike). No inline <script> exists in the
// build (Vite emits external, hashed <script type="module"> files) other than the ::cue subtitle style
// tag and the Cast SDK's own bootstrap, both covered by 'unsafe-inline'/the gstatic.com allowance below.
// style-src still needs 'unsafe-inline': the app intentionally uses React's `style={{...}}` prop in
// several UI spots (avatar colors, progress bars, EPG grid offsets), and browsers enforce CSP against
// those inline style applications when playback/catalog screens render. connect-src/media-src are 'self' plus Google's
// Cast sender origin — video/API calls otherwise go through our own /api/* proxy only, never straight to
// the IPTV provider. www.gstatic.com is the Chromecast sender SDK (lib/cast.ts) — untested against real
// Cast hardware (no device available here), so if casting doesn't work end to end, check the browser
// console for a *different* blocked CSP origin the SDK needs and add it here.
const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self' https://www.gstatic.com",
    // A Inter e do proprio app (/fonts, ver index.html): sem Google Fonts nem origem extra para estilo e fonte.
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
  // /fonts/ leva a versao no nome (inter-v20-latin): seguro cachear por um ano.
  else if (pathname.startsWith('/fonts/')) headers.set('cache-control', 'public, max-age=31536000, immutable')
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

// O Worker nao acessa IP puro: a Cloudflare responde 403 "error code: 1003". Canais do provedor redirecionam
// para http://203.0.113.7/... (visto numa conta real, 09/10), entao os redirecionamentos sao seguidos
// aqui, cada salto passa pelo isAllowed, e o IP vira <ip>.nip.io (DNS publico que responde o proprio IP).
// shortcut: depende do nip.io; se ele sair do ar, trocar por sslip.io (mesmo formato).
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/
const MAX_REDIRECTS = 5

async function fetchFollowing(target, init) {
  let url = new URL(target)
  for (let hop = 0; ; hop++) {
    if (!isAllowed(url)) return new Response('host not allowed', { status: 403 })
    const reach = new URL(url)
    if (IPV4.test(reach.hostname)) reach.hostname += '.nip.io'
    const res = await fetch(reach, { ...init, redirect: 'manual' })
    const loc = res.headers.get('location')
    if (res.status < 300 || res.status > 399 || !loc || hop === MAX_REDIRECTS) return res
    res.body?.cancel()
    url = new URL(loc, url)
  }
}

// Usuario e senha chegam SO em cabecalhos (x-xtream-username/password), fora da URL — a URL aparece no console,
// na aba Rede e no wrangler tail. A query com credenciais ja nao e aceita: o app sempre carrega o HTML novo
// do servidor (service worker network-first), entao nao sobra versao antiga que ainda a use.
async function xtream(request, url) {
  const q = new URLSearchParams(url.searchParams)
  q.delete('username')
  q.delete('password')
  for (const k of ['username', 'password']) {
    const v = request.headers.get(`x-xtream-${k}`)
    if (v != null) q.set(k, v)
  }
  let target
  try {
    target = new URL(`${new URL(q.get('base')).origin}/${q.get('path') || 'player_api.php'}`)
  } catch {
    return new Response('invalid base url', { status: 400 })
  }
  if (!isAllowed(target)) return new Response('host not allowed', { status: 403 })
  for (const [k, v] of q) if (k !== 'base' && k !== 'path') target.searchParams.set(k, v)
  try {
    const up = await fetchFollowing(target, { headers: UPSTREAM_HEADERS, signal: AbortSignal.timeout(20_000) })
    const headers = { 'content-type': up.headers.get('content-type') || 'application/json' }
    // O "espere N segundos" do provedor no 429: o app so para de pedir pelo tempo certo se ele chegar.
    const retryAfter = up.headers.get('retry-after')
    if (retryAfter) headers['retry-after'] = retryAfter
    return new Response(up.body, { status: up.status, headers })
  } catch {
    return Response.json({ error: 'upstream fetch failed' }, { status: 502 })
  }
}

// Este provedor da 502/504 e picos de latencia de varios segundos sob carga — esta documentado no
// proprio projeto. O hls.js absorve isso com a politica de retry configurada no player, mas o Safari
// toca HLS nativamente (de proposito: so assim o AirPlay manda video, e nao so audio para a TV), e o
// player nativo desiste bem mais facil. Resultado relatado: o canal congela e nao volta mais.
//
// Retentar aqui transforma uma falha passageira do provedor numa resposta um pouco mais lenta, em vez de
// um erro que a TV nao tenta de novo. GET e idempotente, inclusive com Range, entao repetir e seguro.
// Nao se retenta 4xx (nao adianta) nem 429 (seria insistir em quem ja pediu para parar).
const RETRY_STATUSES = new Set([502, 503, 504])
const UPSTREAM_ATTEMPTS = 3

async function fetchUpstream(target, request) {
  let lastError
  for (let attempt = 0; attempt < UPSTREAM_ATTEMPTS; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15_000)
    try {
      const res = await fetchFollowing(target, {
        headers: request.headers.has('range')
          ? { ...UPSTREAM_HEADERS, range: request.headers.get('range') }
          : UPSTREAM_HEADERS,
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (!RETRY_STATUSES.has(res.status) || attempt === UPSTREAM_ATTEMPTS - 1) return res
      // Descartar explicitamente: a resposta sera substituida pela da proxima tentativa.
      res.body?.cancel()
    } catch (e) {
      clearTimeout(timer)
      lastError = e
      if (attempt === UPSTREAM_ATTEMPTS - 1) throw e
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
  }
  throw lastError
}

async function stream(request, url, env) {
  let target
  let session = null
  const sid = url.searchParams.get('s')
  if (sid) {
    session = await openSession(env.STREAM_KEY, sid)
    // Chave trocada ou codigo adulterado: o app pede um codigo novo no proximo login/abertura.
    if (!session) return new Response('invalid stream session', { status: 401 })
    target = targetFor(session, url.searchParams.get('p'))
    if (!target) return new Response('invalid path', { status: 400 })
  } else {
    try {
      target = new URL(url.searchParams.get('url'))
    } catch {
      return new Response('invalid url', { status: 400 })
    }
  }
  if (!isAllowed(target)) return new Response('host not allowed', { status: 403 })

  let up
  try {
    up = await fetchUpstream(target, request)
  } catch (e) {
    const timedOut = e.name === 'AbortError'
    return new Response(timedOut ? 'upstream timed out' : 'upstream fetch failed', { status: timedOut ? 504 : 502 })
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

  // raw=1 (playlist M3U baixada para virar catalogo, nao para tocar) nao pode ser reescrita: o dev ja
  // respeitava isso, a producao nao — e cada canal virava um proxy dentro de outro.
  if (url.searchParams.get('raw') !== '1' && ((headers.get('content-type') || '').includes('mpegurl') || target.pathname.endsWith('.m3u8'))) {
    // Resolve against the final URL (after redirects) when that host is public too, otherwise keep the
    // original host (which re-redirects). Also rewrite URI="..." attributes (alt audio, subtitles, keys).
    const base = up.url && isAllowed(new URL(up.url)) ? up.url : target.toString()
    const proxied = (ref) => proxiedRef(new URL(ref, base).toString(), session, sid)
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

// Emite o codigo cifrado das URLs de video (ver streamSession.js). Sem o secret STREAM_KEY responde 204 e o
// app segue montando as URLs do jeito antigo.
async function streamSession(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return new Response('invalid json', { status: 400 })
  }
  const { base, username, password } = body || {}
  if (typeof base !== 'string' || typeof username !== 'string' || typeof password !== 'string') {
    return new Response('missing fields', { status: 400 })
  }
  let origin
  try {
    origin = new URL(base)
  } catch {
    return new Response('invalid base url', { status: 400 })
  }
  if (!isAllowed(origin)) return new Response('host not allowed', { status: 403 })
  const sid = await sealSession(env.STREAM_KEY, { base, username, password })
  if (!sid) return new Response(null, { status: 204 })
  return Response.json({ sid }, { headers: { 'cache-control': 'no-store' } })
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

// IMDb's own rating (far more votes than TMDB's) via OMDb, keyed by the IMDb id TMDB already returns.
// Optional like TMDB: needs the OMDB_KEY secret (free tier, 1,000 lookups/day — the daily cache on the
// /api/tmdb response keeps us well under it). Any failure just means no IMDb badge, never a broken page.
async function imdbRating(imdbId, env) {
  if (!env.OMDB_KEY || !/^tt\d+$/.test(imdbId || '')) return null
  try {
    const res = await fetch(`https://www.omdbapi.com/?${new URLSearchParams({ i: imdbId, apikey: String(env.OMDB_KEY).trim() })}`, {
      signal: AbortSignal.timeout(5000),
    })
    const rating = res.ok ? (await res.json()).imdbRating : null
    return /^\d+(\.\d)?$/.test(rating || '') ? rating : null
  } catch {
    return null
  }
}

// Optional movie-metadata enrichment (genre/year/rating/plot) from TMDB, which Xtream only half-fills.
// Needs the TMDB_TOKEN secret (v4 "API Read Access Token"); without it, or with no match, answers 204 and
// the app just shows what the provider sent. The token stays server-side — never reaches the browser.
async function tmdb(url, env) {
  const title = (url.searchParams.get('title') || '').slice(0, 200)
  const year = url.searchParams.get('year') || ''
  // x-tmdb says why there's no data (never the token), so a silent 204 in production is diagnosable with curl.
  const none = (why) => new Response(null, { status: 204, headers: { 'x-tmdb': why } })
  if (!title) return none('no-title')
  if (!env.TMDB_TOKEN) return none('no-token')
  // A v4 read token is a JWT: exactly 3 dot-separated parts, no whitespace. Reporting only that shape (never
  // the value, not even its length) is what tells a 401 caused by a bad paste — a doubled paste shows 5
  // parts, a copied line break shows ws=1 — apart from a genuinely wrong/revoked token.
  const raw = String(env.TMDB_TOKEN)
  const token = raw.trim()
  const shape = `parts=${token.split('.').length},ws=${Number(raw !== token || /\s/.test(token))}`
  const headers = { authorization: `Bearer ${token}`, accept: 'application/json' }
  const get = (path, params) => fetch(`https://api.themoviedb.org/3${path}?${new URLSearchParams(params)}`, { headers })

  // kind=tv: series. TMDB names the same things differently there (first_air_date, first_air_date_year) and
  // only hands out the IMDb id through external_ids.
  const tv = url.searchParams.get('kind') === 'tv'
  const yearParam = /^\d{4}$/.test(year) ? { [tv ? 'first_air_date_year' : 'year']: year } : {}
  const search = await get(tv ? '/search/tv' : '/search/movie', { query: title, language: 'pt-BR', ...yearParam })
  const hit = search.ok ? (await search.json()).results?.[0] : null
  if (!hit) return none(search.ok ? 'no-match' : `search-${search.status} ${shape}`)
  const details = await get(tv ? `/tv/${hit.id}` : `/movie/${hit.id}`, { language: 'pt-BR', ...(tv ? { append_to_response: 'external_ids' } : {}) })
  if (!details.ok) return none(`details-${details.status}`)
  const d = await details.json()
  const firstDate = tv ? d.first_air_date : d.release_date
  return Response.json(
    {
      genres: (d.genres || []).map((g) => g.name),
      year: firstDate ? firstDate.slice(0, 4) : null,
      rating: d.vote_average || null,
      overview: d.overview || null,
      imdbRating: await imdbRating(tv ? d.external_ids?.imdb_id : d.imdb_id, env),
    },
    { headers: { 'cache-control': 'public, max-age=86400' } },
  )
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
      return withSecurityHeaders(await xtream(request, url))
    }
    if (url.pathname === '/api/session' && request.method === 'POST') {
      if (isRateLimited(ip, 'xtream', 300, 10_000)) return withSecurityHeaders(new Response('rate limited', { status: 429 }))
      return withSecurityHeaders(await streamSession(request, env))
    }
    if (url.pathname === '/api/tmdb') {
      if (isRateLimited(ip, 'tmdb', 60, 10_000)) return withSecurityHeaders(new Response('rate limited', { status: 429 }))
      return withSecurityHeaders(await tmdb(url, env))
    }
    if (url.pathname === '/api/stream') {
      // Media/segments: generous — one viewer can easily fire off a dozen HLS segment/key/subtitle
      // requests within a few seconds, especially right after a channel switch or quality change.
      if (isRateLimited(ip, 'stream', 600, 10_000)) return withSecurityHeaders(new Response('rate limited', { status: 429 }))
      return withSecurityHeaders(await stream(request, url, env))
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request), url.pathname)
  },
}
