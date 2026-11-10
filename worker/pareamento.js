// Login na TV pelo celular, no modelo "device authorization grant" (RFC 8628) que Netflix e YouTube usam:
//   1. a TV pede um pareamento e recebe um codigo curto (user_code, o do QR/da tela) e um codigo longo e secreto
//      (device_code, so ela conhece) que usa para perguntar "ja confirmaram?";
//   2. no celular, a pessoa le o QR (ou digita o codigo) e confirma a conta;
//   3. a TV pergunta ate receber a conta, que sai do servidor uma unica vez.
// Diferenca para o RFC: a conta do provedor nao fica legivel aqui. A TV manda a chave publica (ECDH P-256) ao criar o
// pareamento, o celular cifra a conta com ela (AES-GCM) e o servidor so guarda esse texto cifrado ate a TV buscar
// (src/lib/pareamento.ts). Tudo expira em poucos minutos e e apagado na entrega.

export const TTL_MS = 5 * 60_000
export const INTERVAL_S = 3

// Sem vogais (o codigo nao vira palavra) e sem 0/1/O/I (ninguem confunde ao ler na TV): 20 simbolos x 8 = 2,5e10.
const ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'
const CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ]{8}$/
const B64URL = /^[A-Za-z0-9_-]+$/
// Chave publica P-256 sem compressao: 65 bytes = 87 caracteres em base64url.
const PUB_LEN = 87
const MAX_CIPHER = 8192

function userCode() {
  let out = ''
  while (out.length < 8) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      // Rejeita o resto da divisao desigual (256 nao e multiplo de 20) para nao favorecer simbolos.
      if (b < 240 && out.length < 8) out += ALPHABET[b % 20]
    }
  }
  return out
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
const normalizeCode = (raw) => String(raw ?? '').toUpperCase().replace(/[^A-Z]/g, '')

/** Guarda em memoria (servidor de desenvolvimento e testes). Mesmos metodos do banco D1 abaixo. */
export function memoryStore() {
  const rows = new Map()
  const purge = (now) => {
    for (const [id, r] of rows) if (r.expires <= now) rows.delete(id)
  }
  const find = (code, now) => [...rows.values()].find((r) => r.code === code && r.expires > now)
  return {
    rows,
    async create(row, now) {
      purge(now)
      if (find(row.code, now)) return false
      rows.set(row.id, { ...row, payload: null })
      return true
    },
    async pub(code, now) {
      return find(code, now)?.pub ?? null
    },
    async confirm(code, payload, now) {
      const row = find(code, now)
      if (!row || row.payload) return false
      row.payload = payload
      return true
    },
    async take(id, now) {
      const row = rows.get(id)
      if (!row || row.expires <= now) return 'expired'
      if (!row.payload) return 'pending'
      rows.delete(id)
      return row.payload
    },
  }
}

/** Guarda no D1 do Worker; a tabela nasce na primeira chamada, como a de /api/sync. */
export function d1Store(db) {
  let ready
  const table = () =>
    (ready ??= db
      .prepare('CREATE TABLE IF NOT EXISTS pareamento (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, pub TEXT NOT NULL, expires INTEGER NOT NULL, payload TEXT)')
      .run()
      .catch((err) => {
        ready = undefined
        throw err
      }))
  return {
    async create(row, now) {
      await table()
      await db.prepare('DELETE FROM pareamento WHERE expires <= ?').bind(now).run()
      try {
        await db.prepare('INSERT INTO pareamento (id, code, pub, expires) VALUES (?, ?, ?, ?)').bind(row.id, row.code, row.pub, row.expires).run()
        return true
      } catch {
        return false // codigo curto repetido: quem chama sorteia outro
      }
    },
    async pub(code, now) {
      await table()
      return (await db.prepare('SELECT pub FROM pareamento WHERE code = ? AND expires > ?').bind(code, now).first())?.pub ?? null
    },
    async confirm(code, payload, now) {
      await table()
      const r = await db.prepare('UPDATE pareamento SET payload = ? WHERE code = ? AND expires > ? AND payload IS NULL').bind(payload, code, now).run()
      return (r.meta?.changes ?? 0) > 0
    },
    async take(id, now) {
      await table()
      // Apaga e devolve na mesma instrucao: duas consultas ao mesmo tempo nao recebem a conta duas vezes.
      const got = await db.prepare('DELETE FROM pareamento WHERE id = ? AND expires > ? AND payload IS NOT NULL RETURNING payload').bind(id, now).first()
      if (got) return got.payload
      const row = await db.prepare('SELECT 1 AS ok FROM pareamento WHERE id = ? AND expires > ?').bind(id, now).first()
      return row ? 'pending' : 'expired'
    },
  }
}

async function body(request, max) {
  const text = await request.text()
  if (text.length > max) return undefined
  try {
    const b = JSON.parse(text)
    return b && typeof b === 'object' ? b : undefined
  } catch {
    return undefined
  }
}

const isB64 = (v, max, exact) => typeof v === 'string' && B64URL.test(v) && (exact ? v.length === exact : v.length <= max)

/** /api/parear (POST: TV cria; GET ?code=: celular busca a chave da TV), /api/parear/token (TV pergunta) e
 * /api/parear/confirm (celular entrega a conta cifrada). `noGrupo`: o aparelho ja digitou o codigo do grupo (so o
 * celular precisa: a TV ainda nao tem como, e e justamente isto que ela vai receber). */
export async function parear(request, url, store, noGrupo, now = Date.now()) {
  const path = url.pathname

  if (path === '/api/parear' && request.method === 'POST') {
    const b = await body(request, 512)
    if (!isB64(b?.pub, 0, PUB_LEN)) return json({ error: 'invalid_request' }, 400)
    const deviceCode = hex(crypto.getRandomValues(new Uint8Array(24)))
    const id = await sha256(deviceCode) // o servidor nunca guarda o device_code, so o hash
    for (let i = 0; i < 5; i++) {
      const code = userCode()
      if (await store.create({ id, code, pub: b.pub, expires: now + TTL_MS }, now)) {
        return json({ userCode: code, deviceCode, expiresIn: TTL_MS / 1000, interval: INTERVAL_S })
      }
    }
    return json({ error: 'try_again' }, 503)
  }

  if (path === '/api/parear/token' && request.method === 'POST') {
    const b = await body(request, 256)
    if (typeof b?.deviceCode !== 'string' || !/^[0-9a-f]{48}$/.test(b.deviceCode)) return json({ error: 'invalid_request' }, 400)
    const got = await store.take(await sha256(b.deviceCode), now)
    if (got === 'pending') return json({ error: 'authorization_pending' }, 202)
    if (got === 'expired') return json({ error: 'expired_token' }, 410)
    return new Response(got, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  }

  if (!noGrupo) return new Response('codigo do grupo', { status: 401 })

  if (path === '/api/parear' && request.method === 'GET') {
    const code = normalizeCode(url.searchParams.get('code'))
    const pub = CODE_RE.test(code) ? await store.pub(code, now) : null
    return pub ? json({ pub }) : json({ error: 'not_found' }, 404)
  }

  if (path === '/api/parear/confirm' && request.method === 'POST') {
    const b = await body(request, MAX_CIPHER + 1024)
    const code = normalizeCode(b?.code)
    if (!CODE_RE.test(code) || !isB64(b?.pub, 0, PUB_LEN) || !isB64(b?.iv, 0, 16) || !isB64(b?.ct, MAX_CIPHER)) return json({ error: 'invalid_request' }, 400)
    // So texto cifrado e as duas chaves publicas: e o que a TV precisa para abrir.
    const ok = await store.confirm(code, JSON.stringify({ pub: b.pub, iv: b.iv, ct: b.ct }), now)
    return ok ? new Response(null, { status: 204 }) : json({ error: 'not_found' }, 404)
  }

  return new Response(null, { status: 405 })
}
