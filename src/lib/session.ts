import { accountId, useAccountsStore } from '../store/accounts'
import { useAuthStore } from '../store/auth'
import { useLibraryStore } from '../store/library'
import { useProfilesStore } from '../store/profiles'
import type { UserInfo, XtreamCredentials } from '../types'
import { clearCache } from './cache'
import { XtreamClient } from './xtream'

export function normalizeCredentials(creds: XtreamCredentials): XtreamCredentials {
  let baseUrl = creds.baseUrl.trim().replace(/\/+$/, '')
  // People often paste just "host:port"; panels are plain http far more often than https.
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) baseUrl = `http://${baseUrl}`
  return { baseUrl, username: creds.username.trim(), password: creds.password }
}

export function accountWarning(user: UserInfo): string | null {
  const expiredByDate = user.expDate && Number(user.expDate) > 0 && Number(user.expDate) * 1000 < Date.now()
  return user.status !== 'Active' || expiredByDate
    ? `Conta com status "${user.status}"${expiredByDate ? ' e assinatura vencida' : ''}. O conteúdo pode não carregar corretamente.`
    : null
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
export function ensureActiveProfile(creds: XtreamCredentials): void {
  const accId = accountId(creds)
  const label = useAccountsStore.getState().accounts.find((a) => a.id === accId)?.label
  const { ensureProfile, renameProfile } = useProfilesStore.getState()
  const profileId = ensureProfile(accId, label || creds.username)
  migrateLegacyLibraryData(profileId)

  // Someone who already had this account (profile auto-created and named after the raw Xtream username,
  // before they ever set a custom label at login) gets the label applied here too, once — the avatar and
  // "Gerenciar perfis" would otherwise disagree forever about what this account is called. Only touches
  // it when the name still matches the raw username exactly, so a name someone deliberately picked in
  // Gerenciar perfis (even one that happens to equal the label) is never silently reverted going forward.
  if (label) {
    const profile = useProfilesStore.getState().byAccount[accId]?.profiles.find((p) => p.id === profileId)
    if (profile && profile.name === creds.username && profile.name !== label) renameProfile(accId, profileId, label)
  }
}

/** Validates the credentials against the panel, starts the session and (optionally) remembers the account. */
export async function signIn(raw: XtreamCredentials, remember = true, label?: string): Promise<void> {
  const creds = normalizeCredentials(raw)
  const { user, server } = await new XtreamClient(creds).login()
  const previous = useAuthStore.getState().credentials
  // Switching accounts: the in-memory catalog belongs to the old server.
  if (previous && (previous.baseUrl !== creds.baseUrl || previous.username !== creds.username)) clearCache()
  useAuthStore.getState().setSession(creds, user, server, accountWarning(user))
  if (remember) useAccountsStore.getState().saveAccount(creds, label)
  ensureActiveProfile(creds)
}

/** Refreshes account info (status, expiry, connections) for an already-open session, without ever logging out on failure. */
export async function refreshSession(): Promise<void> {
  const { credentials, setSession } = useAuthStore.getState()
  if (!credentials) return
  try {
    const { user, server } = await new XtreamClient(credentials).login()
    if (useAuthStore.getState().credentials !== credentials) return
    setSession(credentials, user, server, accountWarning(user))
  } catch {
    // Offline or panel hiccup: keep the saved session; the next launch tries again.
  }
}
