import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { clearCache } from '../lib/cache'
import { obfuscatedStorage } from '../lib/obfuscatedStorage'
import type { ServerInfo, UserInfo, XtreamCredentials } from '../types'

interface AuthState {
  credentials: XtreamCredentials | null
  user: UserInfo | null
  server: ServerInfo | null
  sessionWarning: string | null
  setSession: (credentials: XtreamCredentials, user: UserInfo, server: ServerInfo, warning?: string | null) => void
  dismissWarning: () => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      credentials: null,
      user: null,
      server: null,
      sessionWarning: null,
      setSession: (credentials, user, server, warning = null) =>
        set({ credentials, user, server, sessionWarning: warning }),
      dismissWarning: () => set({ sessionWarning: null }),
      logout: () => {
        clearCache()
        set({ credentials: null, user: null, server: null, sessionWarning: null })
      },
    }),
    // Obfuscated (not encrypted — see lib/obfuscatedStorage.ts): this holds the Xtream password in plain
    // reach of anyone with the localStorage key otherwise.
    { name: 'iptv-session', storage: createJSONStorage(() => obfuscatedStorage) },
  ),
)
