import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface FavoriteRef {
  kind: 'live' | 'movie' | 'series'
  id: number
  name: string
  image: string | null
}

export interface WatchProgress {
  kind: 'movie' | 'series'
  id: string
  name: string
  image: string | null
  ext: string
  positionSeconds: number
  durationSeconds: number
  updatedAt: number
  /** Series only: the parent series id, so "continuar assistindo" can offer the next episode without a refetch. */
  seriesId?: number
}

// Every record below is keyed by `${profileId}:${...}` — favorites, resume points and watched
// history are "who's watching" data (like Netflix profiles), separate per profile even though every
// profile shares the same Xtream login/subscription.
interface LibraryState {
  favorites: Record<string, FavoriteRef[]>
  progress: Record<string, WatchProgress>
  // Kept separately from `progress`: once something is finished, its resume
  // point is removed (so it drops out of "continue watching"), but this flag
  // stays forever so episode lists can still show "already watched".
  watched: Record<string, true>
  /** Canais ao vivo abertos por ultimo, por perfil, mais recente primeiro (a tela de canais abre nele). */
  recentLive: Record<string, number[]>
  addRecentLive: (profileId: string, streamId: number) => void
  toggleFavorite: (profileId: string, ref: FavoriteRef) => void
  isFavorite: (profileId: string, kind: FavoriteRef['kind'], id: number) => boolean
  setProgress: (profileId: string, entry: WatchProgress) => void
  removeProgress: (profileId: string, key: string) => void
  markWatched: (profileId: string, key: string) => void
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      favorites: {},
      progress: {},
      watched: {},
      recentLive: {},
      addRecentLive: (profileId, streamId) =>
        set((state) => {
          const list = state.recentLive[profileId] ?? []
          // ponytail: 20 fixos; mais que isso deixa de ser "recente"
          return { recentLive: { ...state.recentLive, [profileId]: [streamId, ...list.filter((id) => id !== streamId)].slice(0, 20) } }
        }),
      toggleFavorite: (profileId, ref) =>
        set((state) => {
          const list = state.favorites[profileId] ?? []
          const exists = list.some((f) => f.kind === ref.kind && f.id === ref.id)
          const next = exists ? list.filter((f) => !(f.kind === ref.kind && f.id === ref.id)) : [ref, ...list]
          return { favorites: { ...state.favorites, [profileId]: next } }
        }),
      isFavorite: (profileId, kind, id) => (get().favorites[profileId] ?? []).some((f) => f.kind === kind && f.id === id),
      setProgress: (profileId, entry) =>
        set((state) => ({ progress: { ...state.progress, [`${profileId}:${entry.kind}-${entry.id}`]: entry } })),
      removeProgress: (profileId, key) =>
        set((state) => {
          const next = { ...state.progress }
          delete next[`${profileId}:${key}`]
          return { progress: next }
        }),
      markWatched: (profileId, key) => set((state) => ({ watched: { ...state.watched, [`${profileId}:${key}`]: true } })),
    }),
    {
      name: 'iptv-library',
      version: 1,
      // Pre-profiles data was a flat, unscoped list — fold it all into one "legacy" bucket so nothing
      // gets silently dropped for people updating from before profiles existed. `ensureProfile`
      // deterministically creates each account's first profile the same way every time, so once that
      // profile exists, App-level code re-keys this bucket to the real profile id (see useLibraryMigration).
      migrate: (persisted) => {
        const state = persisted as { favorites?: unknown; progress?: Record<string, WatchProgress>; watched?: Record<string, true> }
        if (!Array.isArray(state.favorites)) return state // already on the profile-scoped format
        const rekey = <T,>(record: Record<string, T> | undefined): Record<string, T> => {
          const out: Record<string, T> = {}
          for (const [key, value] of Object.entries(record ?? {})) out[`legacy:${key}`] = value
          return out
        }
        return {
          ...state,
          favorites: { legacy: state.favorites },
          progress: rekey(state.progress),
          watched: rekey(state.watched),
        }
      },
    },
  ),
)

const EMPTY_FAVORITES: FavoriteRef[] = []

// These take the raw record (not the zustand selector's `state`) and are meant to be called from a
// `useMemo` keyed on that record, never directly inside a `useLibraryStore(...)` selector: a selector
// runs on every store update and must return a stable, `Object.is`-equal reference when nothing it
// cares about changed, but `progressFor` always builds a brand new array — used as a selector, that
// "changes" on every check and React's external-store subscription re-renders forever chasing it.
export function favoritesFor(favorites: LibraryState['favorites'], profileId: string): FavoriteRef[] {
  return favorites[profileId] ?? EMPTY_FAVORITES
}
export function progressFor(progress: LibraryState['progress'], profileId: string): WatchProgress[] {
  const prefix = `${profileId}:`
  return Object.entries(progress)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value)
}
export function isWatchedFor(watched: LibraryState['watched'], profileId: string, key: string): boolean {
  return Boolean(watched[`${profileId}:${key}`])
}
