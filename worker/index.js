// Cloudflare Worker: serves the built site (ASSETS) and the same /api proxy as server/index.js.
// SSRF/open-relay protection is an allowlist (secret ALLOWED_HOSTS, comma-separated) instead of DNS checks.

// Workers send no User-Agent by default and Xtream panels commonly answer 404 to that.
const UPSTREAM_HEADERS = { 'user-agent': 'Mozilla/5.0' }

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
    const text = (await up.text())
      .split('\n')
      .map((line) => {
        const t = line.trim()
        if (!t || t.startsWith('#')) return line
        return `/api/stream?url=${encodeURIComponent(new URL(t, target).toString())}`
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
    if (url.pathname === '/api/xtream') return xtream(url, env)
    if (url.pathname === '/api/stream') return stream(request, url, env)
    return env.ASSETS.fetch(request)
  },
}
