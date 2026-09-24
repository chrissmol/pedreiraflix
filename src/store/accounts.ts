import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { XtreamCredentials } from '../types'

export interface SavedAccount extends XtreamCredentials {
  id: string
  lastUsedAt: number
}

export function accountId(creds: Pick<XtreamCredentials, 'baseUrl' | 'username'>): string {
  return `${creds.baseUrl.toLowerCase()}|${creds.username}`
}

interface AccountsState {
  // Kept apart from the session on purpose: logging out ends the session but
  // the server/user/password stay here, so getting back in is a single tap.
  accounts: SavedAccount[]
  saveAccount: (creds: XtreamCredentials) => void
  removeAccount: (id: string) => void
}

export const useAccountsStore = create<AccountsState>()(
  persist(
    (set) => ({
      accounts: [],
      saveAccount: (creds) =>
        set((state) => {
          const id = accountId(creds)
          const entry: SavedAccount = { ...creds, id, lastUsedAt: Date.now() }
          return { accounts: [entry, ...state.accounts.filter((a) => a.id !== id)] }
        }),
      removeAccount: (id) => set((state) => ({ accounts: state.accounts.filter((a) => a.id !== id) })),
    }),
    { name: 'iptv-accounts' },
  ),
)
