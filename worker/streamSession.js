// Tira usuario e senha do provedor das URLs de video. O <video> e o AirPlay so aceitam uma URL (nao da para
// mandar cabecalho), entao a URL leva um codigo cifrado (`s`) com as credenciais e o caminho do arquivo com
// marcadores no lugar delas (`p`, ex. /movie/~u/~p/123.mp4). Quem ve a URL (console, aba Rede, wrangler
// tail, um print) nao ve a senha. Compartilhado pelo Worker (producao) e por server/index.js (dev/testes).
//
// A chave e o secret STREAM_KEY (32 bytes em base64, ver scripts/set-stream-key.ps1). Sem ele tudo segue
// como antes, com ?url= — por isso o deploy pode sair antes do secret existir.

const U = '~u'
const P = '~p'

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function importKey(secret) {
  if (!secret) return null
  try {
    const raw = Uint8Array.from(atob(String(secret).trim()), (c) => c.charCodeAt(0))
    if (raw.length !== 32) return null
    return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
  } catch {
    return null
  }
}

/** Cifra {b: origem do painel, u, p}. Devolve null sem chave valida (o cliente segue no modo antigo). */
export async function sealSession(secret, { base, username, password }) {
  const key = await importKey(secret)
  if (!key) return null
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify({ b: new URL(base).origin, u: username, p: password }))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  return b64url(out)
}

export async function openSession(secret, sid) {
  const key = await importKey(secret)
  if (!key || !sid) return null
  try {
    const bytes = fromB64url(sid)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))
    const s = JSON.parse(new TextDecoder().decode(plain))
    return typeof s.b === 'string' && typeof s.u === 'string' && typeof s.p === 'string' ? s : null
  } catch {
    return null
  }
}

/** Monta a URL real do provedor. So aceita caminho no MESMO painel: sem isso, um `p` como "@outro.host/~u/~p"
 * faria o proxy entregar a senha em texto puro para um servidor qualquer. */
export function targetFor(session, path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return null
  const filled = path.replace(U, encodeURIComponent(session.u)).replace(P, encodeURIComponent(session.p))
  try {
    const url = new URL(session.b + filled)
    return url.origin === session.b ? url : null
  } catch {
    return null
  }
}

/** Para reescrever playlists HLS: um endereco do mesmo painel com as credenciais no caminho volta para a forma
 * cifrada; o resto (CDN com token, outro host) segue em ?url= como sempre. */
export function proxiedRef(absUrl, session, sid) {
  if (session) {
    const marker = `/${encodeURIComponent(session.u)}/${encodeURIComponent(session.p)}/`
    if (absUrl.startsWith(session.b + '/') && absUrl.includes(marker)) {
      const path = absUrl.slice(session.b.length).replace(marker, `/${U}/${P}/`)
      return `/api/stream?s=${sid}&p=${encodeURIComponent(path)}`
    }
  }
  return `/api/stream?url=${encodeURIComponent(absUrl)}`
}
