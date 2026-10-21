// "Times favoritos": proxies the two read endpoints of the Mol TV API (where each match airs in Brazil).
// Only these two paths pass, so this is not an open proxy to the rest of that API.
export const MOLTV_ORIGIN = 'https://mol-tv-api.chrisouzamol.workers.dev'

export function molTvTarget(url) {
  const path = url.pathname.slice('/api/moltv'.length)
  if (path === '/v1/search') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 40)
    return q ? `/v1/search?${new URLSearchParams({ q })}` : null
  }
  return /^\/v1\/teams\/[a-z0-9-]{1,80}\/next$/.test(path) ? path : null
}

export async function molTv(url, env) {
  const target = molTvTarget(url)
  if (!target) return new Response('not found', { status: 404 })
  try {
    // Service binding in production (wrangler.jsonc): Worker-to-Worker with no CORS/CSP change and no extra
    // billed request. The public URL is the fallback for local dev (server/index.js), where there is no binding.
    const init = { signal: AbortSignal.timeout(8000) }
    const res = await (env?.MOLTV ? env.MOLTV.fetch(MOLTV_ORIGIN + target, init) : fetch(MOLTV_ORIGIN + target, init))
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': 'application/json', 'cache-control': res.headers.get('cache-control') || 'no-store' },
    })
  } catch {
    return new Response('mol tv unavailable', { status: 502 })
  }
}
