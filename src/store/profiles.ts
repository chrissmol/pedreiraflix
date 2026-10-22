import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuthStore } from './auth'
import { accountId } from './accounts'

export interface Profile {
  id: string
  name: string
  color: string
  /** Hides categories that look like adult content (see lib/parentalControl.ts) across every list, search and direct link. */
  isKids?: boolean
  /** 4-digit PIN required to switch into this profile, if set. Household-level friction, not real security. */
  pin?: string
  /** Categorias que o perfil escondeu e a ordem que escolheu (tela /categorias), por chave `${tipo}:${categoryId}`. */
  hiddenCategories?: string[]
  categoryOrder?: string[]
  /** Sincronizacao entre aparelhos (components/LibrarySync.tsx): a chave do perfil na nuvem, que e a mesma em todo
   * aparelho, e quando ele foi editado por ultimo aqui (sem data = nunca editado desde que o sync existe). */
  syncId?: string
  updatedAt?: number
}

interface AccountProfiles {
  profiles: Profile[]
  activeId: string
}

interface ProfilesState {
  // Keyed by account (server+username), not globally: profiles are "who's watching" on one
  // subscription, and switching to a different Xtream account is a different license entirely.
  byAccount: Record<string, AccountProfiles>
  /** Perfis apagados aqui, pela chave da nuvem, para o sync apagar nos outros aparelhos tambem. */
  deletedSync: Record<string, number>
  /** Creates a first profile named after the account's username if this account has none yet, and
   * always returns a valid active profile id. Safe to call on every login. */
  ensureProfile: (accId: string, defaultName: string) => string
  addProfile: (accId: string, name: string, color: string) => Profile
  removeProfile: (accId: string, profileId: string) => void
  renameProfile: (accId: string, profileId: string, name: string) => void
  setActiveProfile: (accId: string, profileId: string) => void
  setKids: (accId: string, profileId: string, isKids: boolean) => void
  setPin: (accId: string, profileId: string, pin: string | null) => void
  setCategoryPrefs: (accId: string, profileId: string, prefs: Pick<Profile, 'hiddenCategories' | 'categoryOrder'>) => void
}

const COLORS = ['#0f7bff', '#e0479e', '#f5a623', '#22c55e', '#a855f7', '#ef4444']
const EMPTY_PROFILES: Profile[] = []

function newProfile(name: string, colorIndex: number): Profile {
  return { id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, name, color: COLORS[colorIndex % COLORS.length] }
}

function updateProfile(
  state: ProfilesState,
  accId: string,
  profileId: string,
  patch: Partial<Profile>,
): Pick<ProfilesState, 'byAccount'> {
  const account = state.byAccount[accId]
  if (!account) return state
  return {
    byAccount: {
      ...state.byAccount,
      [accId]: { ...account, profiles: account.profiles.map((p) => (p.id === profileId ? { ...p, ...patch, updatedAt: Date.now() } : p)) },
    },
  }
}

export const useProfilesStore = create<ProfilesState>()(
  persist(
    (set, get) => ({
      byAccount: {},
      deletedSync: {},
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
          const removed = account.profiles.find((p) => p.id === profileId)
          const profiles = account.profiles.filter((p) => p.id !== profileId)
          const activeId = account.activeId === profileId ? profiles[0].id : account.activeId
          return {
            byAccount: { ...state.byAccount, [accId]: { profiles, activeId } },
            deletedSync: removed ? { ...state.deletedSync, [removed.syncId ?? removed.id]: Date.now() } : state.deletedSync,
          }
        }),
      renameProfile: (accId, profileId, name) => set((state) => updateProfile(state, accId, profileId, { name })),
      setActiveProfile: (accId, profileId) =>
        set((state) => {
          const account = state.byAccount[accId]
          if (!account) return state
          return { byAccount: { ...state.byAccount, [accId]: { ...account, activeId: profileId } } }
        }),
      setKids: (accId, profileId, isKids) => set((state) => updateProfile(state, accId, profileId, { isKids })),
      setPin: (accId, profileId, pin) => set((state) => updateProfile(state, accId, profileId, { pin: pin || undefined })),
      setCategoryPrefs: (accId, profileId, prefs) => set((state) => updateProfile(state, accId, profileId, prefs)),
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
  // `?? EMPTY_PROFILES` (a module-level constant), not `?? []`: a fresh array literal here would be a
  // new reference on every selector check, and zustand's external-store subscription treats "the
  // selector's result changed" as "re-render" — an infinite loop for any account with no profiles yet.
  return useProfilesStore((s) => (accId ? (s.byAccount[accId]?.profiles ?? EMPTY_PROFILES) : EMPTY_PROFILES))
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
