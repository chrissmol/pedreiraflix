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

interface LibraryState {
  favorites: FavoriteRef[]
  progress: Record<string, WatchProgress>
  // Kept separately from `progress`: once something is finished, its resume
  // point is removed (so it drops out of "continue watching"), but this flag
  // stays forever so episode lists can still show "already watched".
  watched: Record<string, true>
  toggleFavorite: (ref: FavoriteRef) => void
  isFavorite: (kind: FavoriteRef['kind'], id: number) => boolean
  setProgress: (entry: WatchProgress) => void
  removeProgress: (key: string) => void
  markWatched: (key: string) => void
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      favorites: [],
      progress: {},
      watched: {},
      toggleFavorite: (ref) =>
        set((state) => {
          const exists = state.favorites.some((f) => f.kind === ref.kind && f.id === ref.id)
          return {
            favorites: exists
              ? state.favorites.filter((f) => !(f.kind === ref.kind && f.id === ref.id))
              : [ref, ...state.favorites],
          }
        }),
      isFavorite: (kind, id) => get().favorites.some((f) => f.kind === kind && f.id === id),
      setProgress: (entry) =>
        set((state) => ({ progress: { ...state.progress, [`${entry.kind}-${entry.id}`]: entry } })),
      removeProgress: (key) =>
        set((state) => {
          const next = { ...state.progress }
          delete next[key]
          return { progress: next }
        }),
      markWatched: (key) => set((state) => ({ watched: { ...state.watched, [key]: true } })),
    }),
    { name: 'iptv-library' },
  ),
)
