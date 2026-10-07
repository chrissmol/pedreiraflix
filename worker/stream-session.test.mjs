import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openSession, proxiedRef, sealSession, targetFor } from './streamSession.js'

const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
const CREDS = { base: 'http://painel.exemplo:8080', username: 'usuario1', password: 's3nh@' }

test('o codigo cifrado nao contem a senha e abre de volta com a mesma chave', async () => {
  const sid = await sealSession(KEY, CREDS)
  assert.ok(sid && !sid.includes('usuario1') && !sid.includes('s3nh'))
  assert.deepEqual(await openSession(KEY, sid), { b: 'http://painel.exemplo:8080', u: 'usuario1', p: 's3nh@' })
})

test('sem chave (secret ainda nao criado) nao gera codigo: o app segue no formato antigo', async () => {
  assert.equal(await sealSession(undefined, CREDS), null)
  assert.equal(await sealSession('curta', CREDS), null)
})

test('codigo adulterado ou de outra chave e recusado', async () => {
  const sid = await sealSession(KEY, CREDS)
  const outra = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  assert.equal(await openSession(outra, sid), null)
  assert.equal(await openSession(KEY, sid.slice(0, -2) + (sid.endsWith('AA') ? 'BB' : 'AA')), null)
})

test('o caminho so pode apontar para o proprio painel (senao a senha vazaria para outro host)', async () => {
  const s = await openSession(KEY, await sealSession(KEY, CREDS))
  assert.equal(targetFor(s, '/movie/~u/~p/1.mp4').toString(), 'http://painel.exemplo:8080/movie/usuario1/s3nh%40/1.mp4')
  assert.equal(targetFor(s, '@atacante.com/~u/~p/x'), null)
  // '//host' vira so um caminho dentro do proprio painel — o que importa e o host nunca mudar.
  assert.equal(targetFor(s, '//atacante.com/~u/~p/x').origin, 'http://painel.exemplo:8080')
  assert.equal(targetFor(s, 'http://atacante.com/~u/~p/x'), null)
  assert.equal(targetFor(s, undefined), null)
})

test('playlist HLS: endereco do painel com credenciais volta cifrado; CDN segue em ?url=', async () => {
  const sid = await sealSession(KEY, CREDS)
  const s = await openSession(KEY, sid)
  const doPainel = proxiedRef('http://painel.exemplo:8080/live/usuario1/s3nh%40/101_1.ts', s, sid)
  assert.equal(doPainel, `/api/stream?s=${sid}&p=${encodeURIComponent('/live/~u/~p/101_1.ts')}`)
  assert.ok(!doPainel.includes('s3nh'))
  const cdn = proxiedRef('http://cdn.exemplo/hls/token/1.ts', s, sid)
  assert.equal(cdn, `/api/stream?url=${encodeURIComponent('http://cdn.exemplo/hls/token/1.ts')}`)
  assert.equal(proxiedRef('http://x/1.ts', null, null), `/api/stream?url=${encodeURIComponent('http://x/1.ts')}`)
})
