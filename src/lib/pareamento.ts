import { signIn, signInM3u } from './session'
import type { ProviderCredentials } from '../types'

// Login na TV pelo celular (worker/pareamento.js). A conta viaja cifrada de ponta a ponta: a TV manda a chave publica
// (ECDH P-256), o celular deriva uma chave AES-GCM com a dele e cifra, e o Worker so repassa o texto cifrado.

export interface PareamentoPayload {
  v: 1
  creds: Extract<ProviderCredentials, { type: 'xtream' } | { source: 'url' }>
  label?: string
  /** Hash do codigo do grupo, para a TV nao precisar digitar. */
  grupo?: string
}
export interface PareamentoCifrado {
  pub: string
  iv: string
  ct: string
}

const ECDH = { name: 'ECDH', namedCurve: 'P-256' }
const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

const aesKey = async (priv: CryptoKey, pub: string) =>
  crypto.subtle.deriveKey({ name: 'ECDH', public: await crypto.subtle.importKey('raw', unb64(pub), ECDH, false, []) }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

export const temCripto = () => !!globalThis.crypto?.subtle

export async function novoPar() {
  const pair = await crypto.subtle.generateKey(ECDH, false, ['deriveKey'])
  return { priv: pair.privateKey, pub: b64(await crypto.subtle.exportKey('raw', pair.publicKey)) }
}

/** Celular: cifra a conta para a chave publica da TV. */
export async function cifrar(tvPub: string, payload: PareamentoPayload): Promise<PareamentoCifrado> {
  const mine = await novoPar()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(mine.priv, tvPub), new TextEncoder().encode(JSON.stringify(payload)))
  return { pub: mine.pub, iv: b64(iv), ct: b64(ct) }
}

/** TV: abre o que o celular mandou. */
export async function decifrar(priv: CryptoKey, c: PareamentoCifrado): Promise<PareamentoPayload> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(c.iv) }, await aesKey(priv, c.pub), unb64(c.ct))
  return JSON.parse(new TextDecoder().decode(plain))
}

/** Contas que cabem no pareamento: playlist de arquivo so existe neste aparelho. */
export const podeIrParaTv = (c: ProviderCredentials): c is PareamentoPayload['creds'] => c.type === 'xtream' || c.source === 'url'

export const formatarCodigo = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`

/** TV: entra com o que chegou (e guarda o codigo do grupo, se veio). Quem chama recarrega o app depois. */
export async function entrarComPareamento(p: PareamentoPayload, guardarGrupo: (token: string) => void) {
  if (p.grupo) guardarGrupo(p.grupo)
  if (p.creds.type === 'xtream') await signIn(p.creds, true, p.label)
  else await signInM3u({ kind: 'url', url: p.creds.url, epgUrl: p.creds.epgUrl }, true, p.label)
}
