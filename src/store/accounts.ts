import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { type M3uEntry } from '../lib/m3u'
import { obfuscatedStorage } from '../lib/obfuscatedStorage'
import type { ProviderCredentials, XtreamCredentials } from '../types'


export interface SavedAccount {
  id: string
  lastUsedAt: number
  /** User-given label ("Conta principal", "TV da sala") — falls back to the Xtream username when unset. */
  label?: string
  credentials: ProviderCredentials
  /** Only for `credentials.type === 'm3u'` — the playlist parsed once at login, so reopening the
   * account never depends on the original link still being reachable or the file still existing. */
  entries?: M3uEntry[]
}

export function accountId(creds: ProviderCredentials): string {
  if (creds.type === 'xtream') return `xtream|${creds.baseUrl.toLowerCase()}|${creds.username}`
  if (creds.source === 'url') return `m3u-url|${creds.url.toLowerCase()}`
  return `m3u-file|${creds.fileName}`
}

interface AccountsState {
  // Kept apart from the session on purpose: logging out ends the session but
  // the server/user/password stay here, so getting back in is a single tap.
  accounts: SavedAccount[]
  saveAccount: (creds: ProviderCredentials, label?: string, entries?: M3uEntry[]) => void
  removeAccount: (id: string) => void
  renameAccount: (id: string, label: string) => void
}

export const useAccountsStore = create<AccountsState>()(
  persist(
    (set) => ({
      accounts: [],
      saveAccount: (credentials, label, entries) =>
        set((state) => {
          const id = accountId(credentials)
          const existing = state.accounts.find((a) => a.id === id)
          // A blank name on a repeat login keeps whatever label was set before, instead of erasing it.
          const entry: SavedAccount = {
            id,
            credentials,
            entries,
            lastUsedAt: Date.now(),
            label: label?.trim() || existing?.label,
          }
          return { accounts: [entry, ...state.accounts.filter((a) => a.id !== id)] }
        }),
      removeAccount: (id) => set((state) => ({ accounts: state.accounts.filter((a) => a.id !== id) })),
      renameAccount: (id, label) =>
        set((state) => ({
          accounts: state.accounts.map((a) => (a.id === id ? { ...a, label: label.trim() || undefined } : a)),
        })),
    }),
    {
      // Obfuscated (not encrypted — see lib/obfuscatedStorage.ts): every saved account's password lives here.
      name: 'iptv-accounts',
      storage: createJSONStorage(() => obfuscatedStorage),
      // See the matching comment in store/auth.ts: this must differ from the implicit default (0) or
      // `migrate` below never runs, since every account list ever written by this app used version 0.
      version: 1,
      // Pre-M3U-support accounts stored baseUrl/username/password directly on the account, not nested
      // under `credentials` — lift them into the new shape once instead of making every reader handle both.
      migrate: (state) => {
        const s = state as { accounts?: (SavedAccount | (XtreamCredentials & { id: string; lastUsedAt: number; label?: string }))[] }
        s.accounts = (s.accounts || []).map((a) =>
          'credentials' in a ? a : { id: a.id, lastUsedAt: a.lastUsedAt, label: a.label, credentials: { type: 'xtream', baseUrl: a.baseUrl, username: a.username, password: a.password } },
        )
        return s
      },
    },
  ),
)
