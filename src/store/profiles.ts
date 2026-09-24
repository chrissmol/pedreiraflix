import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuthStore } from './auth'
import { accountId } from './accounts'

export interface Profile {
  id: string
  name: string
  color: string
}

interface AccountProfiles {
  profiles: Profile[]
  activeId: string
}

interface ProfilesState {
  // Keyed by account (server+username), not globally: profiles are "who's watching" on one
  // subscription, and switching to a different Xtream account is a different license entirely.
  byAccount: Record<string, AccountProfiles>
  /** Creates a first profile named after the account's username if this account has none yet, and
   * always returns a valid active profile id. Safe to call on every login. */
  ensureProfile: (accId: string, defaultName: string) => string
  addProfile: (accId: string, name: string, color: string) => Profile
  removeProfile: (accId: string, profileId: string) => void
  renameProfile: (accId: string, profileId: string, name: string) => void
  setActiveProfile: (accId: string, profileId: string) => void
}

const COLORS = ['#0f7bff', '#e0479e', '#f5a623', '#22c55e', '#a855f7', '#ef4444']

function newProfile(name: string, colorIndex: number): Profile {
  return { id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, name, color: COLORS[colorIndex % COLORS.length] }
}

export const useProfilesStore = create<ProfilesState>()(
  persist(
    (set, get) => ({
      byAccount: {},
      ensureProfile: (accId, defaultName) => {
        const existing = get().byAccount[accId]
        if (existing && existing.profiles.length > 0) return existing.activeId
        const profile = newProfile(defaultName || 'Perfil 1', 0)
        set((state) => ({ byAccount: { ...state.byAccount, [accId]: { profiles: [profile], activeId: profile.id } } }))
        return profile.id
      },
      addProfile: (accId, name, color) => {
        const account = get().byAccount[accId] ?? { profiles: [], activeId: '' }
        const profile = { ...newProfile(name, account.profiles.length), color: color || newProfile(name, account.profiles.length).color }
        set((state) => ({
          byAccount: { ...state.byAccount, [accId]: { profiles: [...account.profiles, profile], activeId: account.activeId } },
        }))
        return profile
      },
      removeProfile: (accId, profileId) =>
        set((state) => {
          const account = state.byAccount[accId]
          if (!account || account.profiles.length <= 1) return state // always keep at least one
          const profiles = account.profiles.filter((p) => p.id !== profileId)
          const activeId = account.activeId === profileId ? profiles[0].id : account.activeId
          return { byAccount: { ...state.byAccount, [accId]: { profiles, activeId } } }
        }),
      renameProfile: (accId, profileId, name) =>
        set((state) => {
          const account = state.byAccount[accId]
          if (!account) return state
          return {
            byAccount: {
              ...state.byAccount,
              [accId]: { ...account, profiles: account.profiles.map((p) => (p.id === profileId ? { ...p, name } : p)) },
            },
          }
        }),
      setActiveProfile: (accId, profileId) =>
        set((state) => {
          const account = state.byAccount[accId]
          if (!account) return state
          return { byAccount: { ...state.byAccount, [accId]: { ...account, activeId: profileId } } }
        }),
    }),
    { name: 'iptv-profiles' },
  ),
)

/** The active profile id for whichever account is currently logged in, or `null` before a session exists. */
export function useActiveAccountId(): string | null {
  const credentials = useAuthStore((s) => s.credentials)
  return credentials ? accountId(credentials) : null
}

export function useProfiles(): Profile[] {
  const accId = useActiveAccountId()
  return useProfilesStore((s) => (accId ? (s.byAccount[accId]?.profiles ?? []) : []))
}

export function useActiveProfile(): Profile | null {
  const accId = useActiveAccountId()
  const profiles = useProfiles()
  const activeId = useProfilesStore((s) => (accId ? s.byAccount[accId]?.activeId : undefined))
  return profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null
}

/** A stable, never-null id to scope favorites/progress/watched by, even in the brief window before
 * `ensureProfile` has run for a freshly-migrated session. */
export function useActiveProfileId(): string {
  const accId = useActiveAccountId()
  const active = useActiveProfile()
  return active?.id ?? (accId ? `${accId}:default` : 'anonymous')
}
