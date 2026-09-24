import { useAccountsStore } from '../store/accounts'
import { useAuthStore } from '../store/auth'
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

/** Validates the credentials against the panel, starts the session and (optionally) remembers the account. */
export async function signIn(raw: XtreamCredentials, remember = true): Promise<void> {
  const creds = normalizeCredentials(raw)
  const { user, server } = await new XtreamClient(creds).login()
  const previous = useAuthStore.getState().credentials
  // Switching accounts: the in-memory catalog belongs to the old server.
  if (previous && (previous.baseUrl !== creds.baseUrl || previous.username !== creds.username)) clearCache()
  useAuthStore.getState().setSession(creds, user, server, accountWarning(user))
  if (remember) useAccountsStore.getState().saveAccount(creds)
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
