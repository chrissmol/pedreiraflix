import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { clearCache } from '../lib/cache'
import { type M3uEntry } from '../lib/m3u'
import { obfuscatedStorage } from '../lib/obfuscatedStorage'
import type { ProviderCredentials, ServerInfo, UserInfo } from '../types'

interface AuthState {
  credentials: ProviderCredentials | null
  /** Only set when `credentials.type === 'm3u'` — the parsed playlist that backs the M3uClient for this
   * session, carried here (not refetched) so an app relaunch never depends on the link/file again. */
  entries: M3uEntry[] | null
  user: UserInfo | null
  server: ServerInfo | null
  sessionWarning: string | null
  setSession: (
    credentials: ProviderCredentials,
    user: UserInfo,
    server: ServerInfo,
    warning?: string | null,
    entries?: M3uEntry[],
  ) => void
  dismissWarning: () => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      credentials: null,
      entries: null,
      user: null,
      server: null,
      sessionWarning: null,
      setSession: (credentials, user, server, warning = null, entries) =>
        set({ credentials, user, server, sessionWarning: warning, entries: entries ?? null }),
      dismissWarning: () => set({ sessionWarning: null }),
      logout: () => {
        clearCache()
        set({ credentials: null, entries: null, user: null, server: null, sessionWarning: null })
      },
    }),
    {
      // Obfuscated (not encrypted — see lib/obfuscatedStorage.ts): this holds the Xtream password in
      // plain reach of anyone with the localStorage key otherwise.
      name: 'iptv-session',
      storage: createJSONStorage(() => obfuscatedStorage),
      // Bumped from the implicit default (0): zustand only runs `migrate` when the persisted version
      // differs from this one, and every session ever written by this app was written with version 0
      // (the default), so leaving this at 0 would make `migrate` below silently never run for anyone.
      version: 1,
      // A session persisted before M3U support has credentials with no `type` field — tag it 'xtream'
      // on load instead of making every consumer handle both shapes forever.
      migrate: (state) => {
        const s = state as AuthState
        if (s?.credentials && !('type' in s.credentials)) {
          s.credentials = { type: 'xtream', ...(s.credentials as unknown as Record<string, unknown>) } as ProviderCredentials
        }
        return s
      },
    },
  ),
)
