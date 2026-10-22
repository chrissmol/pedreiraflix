import { useEffect } from 'react'
import { applyProfile, claimKeys, extractProfile, mergeProfile, type LibraryRecords, type SyncBlob } from '../lib/librarySync'
import { accountId } from '../store/accounts'
import { useAuthStore } from '../store/auth'
import { loadRecentSearches, useLibraryStore } from '../store/library'
import { useProfilesStore, type Profile } from '../store/profiles'
import type { ProviderCredentials } from '../types'

// Perfis, favoritos, progresso, canais e buscas recentes iguais em todos os aparelhos da mesma conta (/api/sync, D1 no Worker). A chave e um hash
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
  const accId = accountId(creds)
  const profilesState = useProfilesStore.getState()
  const account = profilesState.byAccount[accId]
  if (!account) return
  const claims = claimKeys(account.profiles, remote)
  let records: LibraryRecords = useLibraryStore.getState()
  const out: SyncBlob = { ...remote }
  const profiles: Profile[] = []
  let deleted = 0
  for (const profile of account.profiles) {
    const k = claims[profile.id]
    const r = remote[k]
    // Apagado em outro aparelho depois da ultima mudanca daqui. O ultimo perfil nunca some (a conta sempre tem um).
    if (r?.deletedAt && r.deletedAt > (profile.updatedAt ?? 0) && deleted < account.profiles.length - 1) {
      deleted++
      continue
    }
    records = { ...records, searches: { ...records.searches, [profile.id]: loadRecentSearches(profile.id) } }
    const merged = mergeProfile(extractProfile(records, profile.id, profile), r?.deletedAt ? undefined : r)
    out[k] = merged
    records = applyProfile(records, profile.id, merged)
    profiles.push({ ...profile, ...merged.settings, syncId: k, updatedAt: merged.settingsAt || undefined })
  }
  // Apagados aqui: marca na nuvem, a nao ser que outro aparelho tenha mexido no perfil depois.
  const claimed = new Set(profiles.map((p) => p.syncId))
  for (const [k, at] of Object.entries(profilesState.deletedSync)) {
    if (!claimed.has(k) && (remote[k]?.settingsAt ?? 0) <= at) out[k] = { favorites: [], favoritesAt: 0, teams: [], teamsAt: 0, progress: {}, removed: {}, watched: [], deletedAt: Math.max(at, remote[k]?.deletedAt ?? 0) }
  }
  // Perfis criados em outro aparelho.
  for (const [k, entry] of Object.entries(out)) {
    if (claimed.has(k) || entry.deletedAt) continue
    const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
    profiles.push({ id, color: '#0f7bff', ...entry.settings, name: entry.settings?.name ?? k, syncId: k, updatedAt: entry.settingsAt || undefined })
    records = applyProfile(records, id, entry)
    claimed.add(k)
  }
  if (JSON.stringify(profiles) !== JSON.stringify(account.profiles)) {
    applying = true
    useProfilesStore.setState((state) => {
      const current = state.byAccount[accId]
      const activeId = profiles.some((p) => p.id === current?.activeId) ? current.activeId : profiles[0].id
      return { byAccount: { ...state.byAccount, [accId]: { profiles, activeId } } }
    })
    applying = false
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
      if (!applying && state.byAccount !== prev.byAccount) syncNow()
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
