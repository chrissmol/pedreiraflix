import { type M3uEntry, M3uClient, parseM3u, parseM3uEpgUrl } from './m3u'
import { accountId, type SavedAccount, useAccountsStore } from '../store/accounts'
import { useAuthStore } from '../store/auth'
import { useLibraryStore } from '../store/library'
import { useProfilesStore } from '../store/profiles'
import type { ProviderCredentials, UserInfo, XtreamCredentials } from '../types'
import { clearCache } from './cache'
import { XtreamClient } from './xtream'

export function normalizeCredentials(creds: XtreamCredentials): XtreamCredentials {
  let baseUrl = creds.baseUrl.trim().replace(/\/+$/, '')
  // People often paste just "host:port"; panels are plain http far more often than https.
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) baseUrl = `http://${baseUrl}`
  return { baseUrl, username: creds.username.trim(), password: creds.password }
}

/** The name a fresh profile gets when the account provides no custom label. */
function defaultProfileName(creds: ProviderCredentials): string {
  return creds.type === 'xtream' ? creds.username : 'Playlist M3U'
}

export function accountWarning(user: UserInfo): string | null {
  const expiredByDate = user.expDate && Number(user.expDate) > 0 && Number(user.expDate) * 1000 < Date.now()
  return user.status !== 'Active' || expiredByDate
    ? `Conta com status "${user.status}"${expiredByDate ? ' e assinatura vencida' : ''}. O conteúdo pode não carregar corretamente.`
    : null
}

/** Telas em uso na conta, para o menu mostrar quando o limite do provedor esta cheio. null quando o provedor nao
 * informa um limite (ou nao e Xtream: o login por M3U inventa 1 de 1, que nao quer dizer nada). */
export function connectionStatus(user: UserInfo | null): { active: number; max: number; full: boolean } | null {
  if (!user) return null
  const active = Number(user.activeConnections)
  const max = Number(user.maxConnections)
  if (!Number.isFinite(active) || !Number.isFinite(max) || max <= 0) return null
  return { active, max, full: active >= max }
}

/** Moves the pre-profiles "legacy" favorites/progress/watched bucket onto an account's real first
 * profile, the first time that profile exists. Safe to call on every login/launch — once the legacy
 * bucket is empty, it's a no-op forever after. */
function migrateLegacyLibraryData(profileId: string) {
  if (profileId === 'legacy') return
  const { favorites, progress, watched } = useLibraryStore.getState()
  const legacyFavorites = favorites.legacy
  const hasLegacyProgress = Object.keys(progress).some((k) => k.startsWith('legacy:'))
  const hasLegacyWatched = Object.keys(watched).some((k) => k.startsWith('legacy:'))
  if (!legacyFavorites && !hasLegacyProgress && !hasLegacyWatched) return

  useLibraryStore.setState((state) => {
    const nextFavorites = { ...state.favorites }
    if (legacyFavorites) {
      delete nextFavorites.legacy
      nextFavorites[profileId] = [...legacyFavorites, ...(nextFavorites[profileId] ?? [])]
    }
    const nextProgress = { ...state.progress }
    for (const [key, value] of Object.entries(state.progress)) {
      if (!key.startsWith('legacy:')) continue
      delete nextProgress[key]
      nextProgress[`${profileId}:${key.slice('legacy:'.length)}`] = value
    }
    const nextWatched = { ...state.watched }
    for (const key of Object.keys(state.watched)) {
      if (!key.startsWith('legacy:')) continue
      delete nextWatched[key]
      nextWatched[`${profileId}:${key.slice('legacy:'.length)}`] = true
    }
    return { favorites: nextFavorites, progress: nextProgress, watched: nextWatched }
  })
}

/** Ensures the given account has at least one profile (creating a default profile the first time — named
 * after the custom label the account was saved under, if any, since that's the name the person actually
 * chose, or the raw Xtream username otherwise), and folds in any pre-profiles data. Call whenever a
 * session for this account becomes active — on sign-in, and again at app launch for a session that was
 * already open. */
export function ensureActiveProfile(creds: ProviderCredentials): void {
  const accId = accountId(creds)
  const label = useAccountsStore.getState().accounts.find((a) => a.id === accId)?.label
  const defaultName = defaultProfileName(creds)
  const { ensureProfile, renameProfile } = useProfilesStore.getState()
  const profileId = ensureProfile(accId, label || defaultName)
  migrateLegacyLibraryData(profileId)

  // Someone who already had this account (profile auto-created and named after the raw Xtream username,
  // before they ever set a custom label at login) gets the label applied here too, once — the avatar and
  // "Gerenciar perfis" would otherwise disagree forever about what this account is called. Only touches
  // it when the name still matches the raw username exactly, so a name someone deliberately picked in
  // Gerenciar perfis (even one that happens to equal the label) is never silently reverted going forward.
  if (label) {
    const profile = useProfilesStore.getState().byAccount[accId]?.profiles.find((p) => p.id === profileId)
    if (profile && profile.name === defaultName && profile.name !== label) renameProfile(accId, profileId, label)
  }
}

function switchedAccount(previous: ProviderCredentials | null, next: ProviderCredentials): boolean {
  return !previous || accountId(previous) !== accountId(next)
}

/** Validates the credentials against the panel, starts the session and (optionally) remembers the account. */
export async function signIn(raw: XtreamCredentials, remember = true, label?: string): Promise<void> {
  const creds: ProviderCredentials = { type: 'xtream', ...normalizeCredentials(raw) }
  const { user, server } = await new XtreamClient(creds).login()
  const previous = useAuthStore.getState().credentials
  // Switching accounts: the in-memory catalog belongs to the old server.
  if (switchedAccount(previous, creds)) clearCache()
  useAuthStore.getState().setSession(creds, user, server, accountWarning(user))
  if (remember) useAccountsStore.getState().saveAccount(creds, label)
  ensureActiveProfile(creds)
}

/** Same as `signIn`, but for an M3U playlist instead of an Xtream panel — the text is fetched (link) or
 * read locally (file) once here, parsed, and the entries carried in the session/saved account from then
 * on, so playback never depends on a second fetch. */
export async function signInM3u(
  source: ({ kind: 'url'; url: string } | { kind: 'file'; file: File }) & { epgUrl?: string },
  remember = true,
  label?: string,
): Promise<void> {
  const text =
    source.kind === 'url'
      ? await fetch(`/api/stream?raw=1&url=${encodeURIComponent(source.url)}`).then((r) => {
          if (!r.ok) throw new Error(`Falha ao baixar a playlist: ${r.status}`)
          return r.text()
        })
      : await source.file.text()

  const entries: M3uEntry[] = parseM3u(text)
  if (entries.length === 0) throw new Error('Nenhum canal encontrado nessa playlist M3U')

  // The playlist's own url-tvg wins; the typed one is the fallback for the many playlists that ship
  // tvg-id on every channel but declare no guide at all.
  const typed = source.epgUrl?.trim()
  const epgUrl = parseM3uEpgUrl(text) ?? (typed && /^https?:\/\//i.test(typed) ? typed : undefined)
  const creds: ProviderCredentials =
    source.kind === 'url'
      ? { type: 'm3u', source: 'url', url: source.url, epgUrl }
      : { type: 'm3u', source: 'file', fileName: source.file.name, epgUrl }

  const { user, server } = await new M3uClient(entries, epgUrl).login()
  const previous = useAuthStore.getState().credentials
  if (switchedAccount(previous, creds)) clearCache()
  useAuthStore.getState().setSession(creds, user, server, accountWarning(user), entries)
  if (remember) useAccountsStore.getState().saveAccount(creds, label, entries)
  ensureActiveProfile(creds)
}

/** Re-enters a saved account. For Xtream this still validates against the panel (catches an expired/
 * revoked login early); for M3U there's no panel to validate against, so it just restores the playlist
 * that was parsed and saved at the original sign-in. */
export async function signInSavedAccount(account: SavedAccount): Promise<void> {
  if (account.credentials.type === 'xtream') {
    try {
      await signIn(account.credentials, true, account.label)
    } catch (err) {
      // Sem internet nao da para perguntar ao provedor se a conta vale — mas a conta e salva neste aparelho, e
      // sem entrar ninguem chegaria aos downloads (pedido do Christian, 08/10). Entra com os dados guardados;
      // quando a conexao voltar, refreshSession() confere a conta de verdade. So falta de rede: senha errada
      // ou conta vencida continuam barrando.
      if (navigator.onLine && !(err instanceof TypeError)) throw err
      const creds = account.credentials
      const previous = useAuthStore.getState().credentials
      if (switchedAccount(previous, creds)) clearCache()
      const user: UserInfo = { username: creds.username, status: 'Active', expDate: null, isTrial: false, activeConnections: '', maxConnections: '' }
      useAuthStore.getState().setSession(creds, user, { url: '', serverName: '', timezone: '' }, 'Sem internet: dá para assistir os seus downloads. O resto volta quando a conexão voltar.')
      ensureActiveProfile(creds)
    }
    return
  }
  if (!account.entries) throw new Error('Playlist da conta salva não encontrada — faça login novamente')
  const creds = account.credentials
  const { user, server } = await new M3uClient(account.entries, creds.epgUrl).login()
  const previous = useAuthStore.getState().credentials
  if (switchedAccount(previous, creds)) clearCache()
  useAuthStore.getState().setSession(creds, user, server, accountWarning(user), account.entries)
  useAccountsStore.getState().saveAccount(creds, account.label, account.entries)
  ensureActiveProfile(creds)
}

/** Refreshes account info (status, expiry, connections) for an already-open Xtream session, without ever
 * logging out on failure. M3U sessions have no server to refresh against — nothing to do. */
let lastRefreshAt = 0

export async function refreshSession(minIntervalMs = 0): Promise<void> {
  const { credentials, setSession } = useAuthStore.getState()
  if (!credentials || credentials.type !== 'xtream') return
  // Abrir o menu da conta repetidas vezes nao pode virar uma chamada ao provedor a cada abertura.
  if (Date.now() - lastRefreshAt < minIntervalMs) return
  lastRefreshAt = Date.now()
  try {
    const { user, server } = await new XtreamClient(credentials).login()
    if (useAuthStore.getState().credentials !== credentials) return
    setSession(credentials, user, server, accountWarning(user))
  } catch {
    // Offline or panel hiccup: keep the saved session; the next launch tries again.
  }
}
