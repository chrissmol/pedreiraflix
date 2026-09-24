import dns from 'node:dns/promises'
import net from 'node:net'
import cors from 'cors'
import express from 'express'

const app = express()

// Only the Vite dev origin may call this proxy — a wildcard CORS policy here
// would let any website the user visits pivot through localhost to reach
// internal network services (classic drive-by SSRF via a local dev server).
const ALLOWED_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:5173'
app.use(cors({ origin: ALLOWED_ORIGIN }))

// Mirrors worker/index.js's headers on this proxy's own responses (the deployed Cloudflare Worker is
// what actually matters for CSP on the real site — it serves the HTML too, this dev server only ever
// serves /api/* — but matching them here keeps local dev honest and gives the same nosniff/rate-limit
// protection if this ever gets exposed by accident).
app.use((req, res, next) => {
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin')
  next()
})

// Same self-contained per-IP throttle as the Worker — see worker/index.js for the rationale.
const rateBuckets = new Map()
function isRateLimited(ip, key, limit, windowMs) {
  const now = Date.now()
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
app.use('/api/xtream', (req, res, next) => {
  if (isRateLimited(req.ip, 'xtream', 300, 10_000)) return res.status(429).send('rate limited')
  next()
})
app.use('/api/stream', (req, res, next) => {
  if (isRateLimited(req.ip, 'stream', 600, 10_000)) return res.status(429).send('rate limited')
  next()
})

const PORT = process.env.PORT || 8787

function sanitizeBaseUrl(raw) {
  if (!raw) return null
  let url
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  return `${url.protocol}//${url.host}`
}

// Blocks requests to loopback, private, link-local and other non-public
// ranges so the proxy can't be used to reach internal/cloud-metadata
// services. Xtream panels are always public internet hosts, so this never
// affects legitimate use.
function isPrivateAddress(address, family) {
  if (family === 6 || address.includes(':')) {
    const normalized = address.toLowerCase()
    return (
      normalized === '::1' ||
      normalized.startsWith('fe80:') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('::ffff:127.') ||
      normalized === '::'
    )
  }
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true
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

// Only for the local e2e suite, whose mock Xtream panel runs on localhost.
const ALLOW_PRIVATE_HOSTS = process.env.ALLOW_PRIVATE_HOSTS === '1'

async function assertPublicHost(hostname) {
  if (ALLOW_PRIVATE_HOSTS) return
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname, net.isIP(hostname))) {
      throw new Error(`refusing to contact non-public address: ${hostname}`)
    }
    return
  }
  const records = await dns.lookup(hostname, { all: true })
  for (const record of records) {
    if (isPrivateAddress(record.address, record.family)) {
      throw new Error(`refusing to contact non-public address: ${hostname} -> ${record.address}`)
    }
  }
}

// Proxies Xtream Codes JSON API calls (player_api.php, xmltv.php, etc).
app.get('/api/xtream', async (req, res) => {
  const { base, path, ...rest } = req.query
  const baseUrl = sanitizeBaseUrl(typeof base === 'string' ? base : '')
  if (!baseUrl) return res.status(400).json({ error: 'invalid base url' })

  const target = new URL(`${baseUrl}/${path || 'player_api.php'}`)
  for (const [key, value] of Object.entries(rest)) {
    if (typeof value === 'string') target.searchParams.set(key, value)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  req.on('close', () => controller.abort())

  try {
    await assertPublicHost(target.hostname)
    const upstream = await fetch(target.toString(), { signal: controller.signal })
    const contentType = upstream.headers.get('content-type') || 'application/json'
    res.status(upstream.status)
    res.setHeader('content-type', contentType)
    const buffer = Buffer.from(await upstream.arrayBuffer())
    res.send(buffer)
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: 'upstream fetch failed', detail: String(err) })
    }
  } finally {
    clearTimeout(timeout)
  }
})

// Proxies live/VOD/series media streams (HLS playlists, TS/MP4 segments).
app.get('/api/stream', async (req, res) => {
  const { url, download, filename } = req.query
  if (typeof url !== 'string') return res.status(400).send('missing url')

  let target
  try {
    target = new URL(url)
  } catch {
    return res.status(400).send('invalid url')
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return res.status(400).send('invalid protocol')
  }

  // Abort the upstream request the moment the client disconnects, and cap how
  // long we wait for the origin to respond at all (playlists especially can hang).
  const controller = new AbortController()
  const connectTimeout = setTimeout(() => controller.abort(), 15_000)
  req.on('close', () => controller.abort())

  try {
    await assertPublicHost(target.hostname)
    const upstream = await fetch(target.toString(), {
      headers: req.headers.range ? { range: req.headers.range } : undefined,
      signal: controller.signal,
    })
    clearTimeout(connectTimeout)

    res.status(upstream.status)
    for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(header)
      if (value) res.setHeader(header, value)
    }
    if (download === '1') {
      const safeName = (typeof filename === 'string' ? filename : 'download').replace(/[\r\n"]/g, '_')
      res.setHeader('content-disposition', `attachment; filename="${safeName}"`)
    }

    const contentType = upstream.headers.get('content-type') || ''
    // Mirrors worker/index.js: posters/logos get real caching, video/HLS is untouched.
    if (contentType.startsWith('image/')) res.setHeader('cache-control', 'public, max-age=604800')
    if (contentType.includes('mpegurl') || target.pathname.endsWith('.m3u8')) {
      // Rewrite playlist entries to route back through this proxy. Resolve
      // against the final URL (panels usually redirect streams to a CDN), and
      // include URI="..." attributes (alternate audio, subtitles, keys).
      const base = upstream.url || target.toString()
      const proxied = (ref) => `/api/stream?url=${encodeURIComponent(new URL(ref, base).toString())}`
      const text = await upstream.text()
      const rewritten = text
        .split('\n')
        .map((line) => {
          const trimmed = line.trim()
          if (!trimmed) return line
          if (trimmed.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, ref) => `URI="${proxied(ref)}"`)
          return proxied(trimmed)
        })
        .join('\n')
      res.removeHeader('content-length')
      res.setHeader('content-type', 'application/vnd.apple.mpegurl')
      res.send(rewritten)
      return
    }

    if (!upstream.body) return res.end()
    const reader = upstream.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        // Respect backpressure: if the client's socket buffer is full, wait for
        // it to drain before pulling more from the origin, instead of piling
        // segments up in memory (the classic cause of runaway RAM under load).
        const canContinue = res.write(value)
        if (!canContinue) {
          await new Promise((resolve) => res.once('drain', resolve))
        }
      }
      res.end()
    } finally {
      reader.releaseLock()
    }
  } catch (err) {
    clearTimeout(connectTimeout)
    if (!res.headersSent) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      res.status(isAbort ? 504 : 502).send(isAbort ? 'upstream timed out' : `upstream fetch failed: ${err}`)
    }
  }
})

app.listen(PORT, () => {
  console.log(`IPTV proxy server running on http://localhost:${PORT}`)
})
