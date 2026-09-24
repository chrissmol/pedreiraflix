import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { XtreamCredentials } from '../types'

export interface SavedAccount extends XtreamCredentials {
  id: string
  lastUsedAt: number
  /** User-given label ("Conta principal", "TV da sala") — falls back to the Xtream username when unset. */
  label?: string
}

export function accountId(creds: Pick<XtreamCredentials, 'baseUrl' | 'username'>): string {
  return `${creds.baseUrl.toLowerCase()}|${creds.username}`
}

interface AccountsState {
  // Kept apart from the session on purpose: logging out ends the session but
  // the server/user/password stay here, so getting back in is a single tap.
  accounts: SavedAccount[]
  saveAccount: (creds: XtreamCredentials, label?: string) => void
  removeAccount: (id: string) => void
  renameAccount: (id: string, label: string) => void
}

export const useAccountsStore = create<AccountsState>()(
  persist(
    (set) => ({
      accounts: [],
      saveAccount: (creds, label) =>
        set((state) => {
          const id = accountId(creds)
          const existing = state.accounts.find((a) => a.id === id)
          // A blank name on a repeat login keeps whatever label was set before, instead of erasing it.
          const entry: SavedAccount = { ...creds, id, lastUsedAt: Date.now(), label: label?.trim() || existing?.label }
          return { accounts: [entry, ...state.accounts.filter((a) => a.id !== id)] }
        }),
      removeAccount: (id) => set((state) => ({ accounts: state.accounts.filter((a) => a.id !== id) })),
      renameAccount: (id, label) =>
        set((state) => ({
          accounts: state.accounts.map((a) => (a.id === id ? { ...a, label: label.trim() || undefined } : a)),
        })),
    }),
    { name: 'iptv-accounts' },
  ),
)
