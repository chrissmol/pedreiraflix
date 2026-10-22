import { useEffect } from 'react'
import { applyProfile, extractProfile, mergeProfile, profileSyncName, type LibraryRecords, type SyncBlob } from '../lib/librarySync'
import { accountId } from '../store/accounts'
import { useAuthStore } from '../store/auth'
import { useLibraryStore } from '../store/library'
import { useProfilesStore } from '../store/profiles'
import type { ProviderCredentials } from '../types'

// Favoritos e progresso iguais em todos os aparelhos da mesma conta (/api/sync, D1 no Worker). A chave e um hash
// de servidor+usuario+senha: o Worker nao ve a senha e so quem tem o login le os dados. Playlist de arquivo nao
// tem segredo nenhum, entao fica so no aparelho.
async function syncKey(creds: ProviderCredentials): Promise<string | null> {
  const secret = creds.type === 'xtream' ? `${accountId(creds)}|${creds.password}` : creds.source === 'url' ? accountId(creds) : null
  if (!secret || !crypto.subtle) return null
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

let applying = false
let running: Promise<void> | null = null
let again = false

async function syncOnce(): Promise<void> {
  const creds = useAuthStore.getState().credentials
  if (!creds) return
  const key = await syncKey(creds)
  if (!key) return
  const res = await fetch('/api/sync', { headers: { 'x-sync-key': key }, cache: 'no-store' })
  if (!res.ok) return
  const remote = (await res.json()) as SyncBlob
  // Junta agora, de forma sincrona, com o estado atual: o que mudou durante o fetch nao se perde.
  const profiles = useProfilesStore.getState().byAccount[accountId(creds)]?.profiles ?? []
  let records: LibraryRecords = useLibraryStore.getState()
  const out: SyncBlob = { ...remote }
  for (const profile of profiles) {
    const name = profileSyncName(profile.name)
    const merged = mergeProfile(extractProfile(records, profile.id), out[name])
    out[name] = merged
    records = applyProfile(records, profile.id, merged)
  }
  const before = useLibraryStore.getState()
  const changed = (Object.keys(records) as (keyof LibraryRecords)[]).filter((k) => JSON.stringify(records[k]) !== JSON.stringify(before[k]))
  if (changed.length) {
    applying = true
    useLibraryStore.setState(Object.fromEntries(changed.map((k) => [k, records[k]])))
    applying = false
  }
  const body = JSON.stringify(out)
  if (body !== JSON.stringify(remote)) await fetch('/api/sync', { method: 'PUT', headers: { 'x-sync-key': key, 'content-type': 'application/json' }, body, keepalive: body.length < 60_000 })
}

function syncNow() {
  // Uma por vez (pedido durante uma roda de novo no fim); erro de rede so espera a proxima, os dados continuam aqui.
  if (running) {
    again = true
    return
  }
  running = syncOnce()
    .catch(() => {})
    .finally(() => {
      running = null
      if (again) {
        again = false
        syncNow()
      }
    })
}

/** Montado uma vez no App: sincroniza ao entrar, ao voltar para o app e ate 1 min depois de cada mudanca. */
export default function LibrarySync() {
  const credentials = useAuthStore((s) => s.credentials)

  useEffect(() => {
    if (!credentials) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      if (timer) clearTimeout(timer)
      timer = null
      syncNow()
    }
    // Atraso fixo, nao debounce: o player grava progresso a cada 5 s e um debounce nunca dispararia vendo filme.
    const unsubscribe = useLibraryStore.subscribe(() => {
      if (!applying && !timer) timer = setTimeout(flush, 60_000)
    })
    // Perfil novo ou renomeado (ex.: o primeiro perfil, criado logo depois do login) ja puxa o que esta na nuvem.
    const unsubscribeProfiles = useProfilesStore.subscribe((state, prev) => {
      if (state.byAccount !== prev.byAccount) syncNow()
    })
    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncNow()
      else if (timer) flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    syncNow()
    return () => {
      unsubscribe()
      unsubscribeProfiles()
      document.removeEventListener('visibilitychange', onVisibility)
      if (timer) flush()
    }
  }, [credentials])

  return null
}
