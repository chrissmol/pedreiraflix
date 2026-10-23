import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { searchKey } from '../lib/search'

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

export interface SeriesDone {
  episodes: number
  done: boolean
  at: number
}

// Every record below is keyed by `${profileId}:${...}` — favorites, resume points and watched
// history are "who's watching" data (like Netflix profiles), separate per profile even though every
// profile shares the same Xtream login/subscription.
/** A team from the Mol TV API ("Times favoritos"): its slug is what /api/moltv/v1/teams/{slug}/next takes. */
export interface FavoriteTeam {
  slug: string
  name: string
}

interface LibraryState {
  favorites: Record<string, FavoriteRef[]>
  progress: Record<string, WatchProgress>
  // Kept separately from `progress`: once something is finished, its resume
  // point is removed (so it drops out of "continue watching"), but this flag
  // stays forever so episode lists can still show "already watched".
  watched: Record<string, true>
  /** Series inteiras ja vistas, por `${perfil}:${seriesId}` (o `watched` acima so guarda o id do episodio, sem a serie).
   * `episodes` e quantos havia quando terminou: se o provedor trouxer mais, a pagina mostra "Novos episódios". */
  seriesDone: Record<string, SeriesDone>
  /** Canais ao vivo abertos por ultimo, por perfil, mais recente primeiro (a tela de canais abre nele). */
  recentLive: Record<string, number[]>
  addRecentLive: (profileId: string, streamId: number) => void
  favoriteTeams: Record<string, FavoriteTeam[]>
  toggleTeam: (profileId: string, team: FavoriteTeam) => void
  /** Tira um canal dos recentes; sem streamId, limpa todos do perfil. */
  removeRecentLive: (profileId: string, streamId?: number) => void
  toggleFavorite: (profileId: string, ref: FavoriteRef) => void
  isFavorite: (profileId: string, kind: FavoriteRef['kind'], id: number) => boolean
  setProgress: (profileId: string, entry: WatchProgress) => void
  removeProgress: (profileId: string, key: string) => void
  markWatched: (profileId: string, key: string) => void
  // Para sincronizar entre aparelhos (lib/librarySync.ts): quando cada lista mudou por ultimo e quando cada
  // progresso foi tirado, para o "ultimo vence" nao ressuscitar o que outro aparelho apagou.
  favoritesAt: Record<string, number>
  teamsAt: Record<string, number>
  progressRemoved: Record<string, number>
  recentLiveAt: Record<string, number>
  /** Buscas recentes por perfil, mais nova primeiro (lib/search.ts). */
  searches: Record<string, string[]>
  searchesAt: Record<string, number>
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      favorites: {},
      progress: {},
      watched: {},
      seriesDone: {},
      recentLive: {},
      favoriteTeams: {},
      favoritesAt: {},
      teamsAt: {},
      progressRemoved: {},
      recentLiveAt: {},
      searches: {},
      searchesAt: {},
      toggleTeam: (profileId, team) =>
        set((state) => {
          const list = state.favoriteTeams[profileId] ?? []
          const next = list.some((t) => t.slug === team.slug) ? list.filter((t) => t.slug !== team.slug) : [...list, team]
          return { favoriteTeams: { ...state.favoriteTeams, [profileId]: next }, teamsAt: { ...state.teamsAt, [profileId]: Date.now() } }
        }),
      addRecentLive: (profileId, streamId) =>
        set((state) => {
          const list = state.recentLive[profileId] ?? []
          // ponytail: 20 fixos; mais que isso deixa de ser "recente"
          return {
            recentLive: { ...state.recentLive, [profileId]: [streamId, ...list.filter((id) => id !== streamId)].slice(0, 20) },
            recentLiveAt: { ...state.recentLiveAt, [profileId]: Date.now() },
          }
        }),
      removeRecentLive: (profileId, streamId) =>
        set((state) => ({
          recentLive: {
            ...state.recentLive,
            [profileId]: streamId == null ? [] : (state.recentLive[profileId] ?? []).filter((id) => id !== streamId),
          },
          recentLiveAt: { ...state.recentLiveAt, [profileId]: Date.now() },
        })),
      toggleFavorite: (profileId, ref) =>
        set((state) => {
          const list = state.favorites[profileId] ?? []
          const exists = list.some((f) => f.kind === ref.kind && f.id === ref.id)
          const next = exists ? list.filter((f) => !(f.kind === ref.kind && f.id === ref.id)) : [ref, ...list]
          return { favorites: { ...state.favorites, [profileId]: next }, favoritesAt: { ...state.favoritesAt, [profileId]: Date.now() } }
        }),
      isFavorite: (profileId, kind, id) => (get().favorites[profileId] ?? []).some((f) => f.kind === kind && f.id === id),
      setProgress: (profileId, entry) =>
        set((state) => ({ progress: { ...state.progress, [`${profileId}:${entry.kind}-${entry.id}`]: entry } })),
      removeProgress: (profileId, key) =>
        set((state) => {
          const next = { ...state.progress }
          delete next[`${profileId}:${key}`]
          return { progress: next, progressRemoved: { ...state.progressRemoved, [`${profileId}:${key}`]: Date.now() } }
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
const EMPTY_TEAMS: FavoriteTeam[] = []

// These take the raw record (not the zustand selector's `state`) and are meant to be called from a
// `useMemo` keyed on that record, never directly inside a `useLibraryStore(...)` selector: a selector
// runs on every store update and must return a stable, `Object.is`-equal reference when nothing it
// cares about changed, but `progressFor` always builds a brand new array — used as a selector, that
// "changes" on every check and React's external-store subscription re-renders forever chasing it.
export function favoritesFor(favorites: LibraryState['favorites'], profileId: string): FavoriteRef[] {
  return favorites[profileId] ?? EMPTY_FAVORITES
}
export function teamsFor(favoriteTeams: LibraryState['favoriteTeams'], profileId: string): FavoriteTeam[] {
  return favoriteTeams[profileId] ?? EMPTY_TEAMS
}
export function progressFor(progress: LibraryState['progress'], profileId: string): WatchProgress[] {
  const prefix = `${profileId}:`
  return Object.entries(progress)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value)
}
/** Recalcula se a serie foi toda vista (sem especiais da temporada 0) e grava so quando muda. Chamado pela pagina da
 * serie e pelo player, que ja tem a lista de episodios: nao pede nada ao provedor. */
export function updateSeriesDone(profileId: string, seriesId: number, seasons: { seasonNumber: number; episodes: { id: string }[] }[]): void {
  const episodes = seasons.filter((s) => s.seasonNumber > 0).flatMap((s) => s.episodes)
  if (!episodes.length) return
  const { watched, seriesDone } = useLibraryStore.getState()
  const key = `${profileId}:${seriesId}`
  const prev = seriesDone[key]
  const all = episodes.every((ep) => watched[`${profileId}:series-${ep.id}`])
  let next: SeriesDone | null = null
  if (all && (!prev?.done || prev.episodes !== episodes.length)) next = { episodes: episodes.length, done: true, at: Date.now() }
  else if (!all && prev?.done) next = { ...prev, done: false, at: Date.now() }
  if (next) useLibraryStore.setState((state) => ({ seriesDone: { ...state.seriesDone, [key]: next } }))
}

export function isWatchedFor(watched: LibraryState['watched'], profileId: string, key: string): boolean {
  return Boolean(watched[`${profileId}:${key}`])
}

// --- Buscas recentes, uma lista por perfil (o perfil infantil nao ve o que o adulto buscou) ---
const MAX_RECENT = 8

export function loadRecentSearches(profileId: string): string[] {
  const saved = useLibraryStore.getState().searches[profileId]
  if (saved) return saved
  // Antes ficavam numa chave propria do localStorage: le de la ate a primeira busca nova gravar aqui.
  try {
    const list = JSON.parse(localStorage.getItem(`pf-buscas-recentes:${profileId}`) || '[]')
    return Array.isArray(list) ? list.filter((q): q is string => typeof q === 'string') : []
  } catch {
    return []
  }
}

function setSearches(profileId: string, list: string[]) {
  useLibraryStore.setState((state) => ({
    searches: { ...state.searches, [profileId]: list },
    searchesAt: { ...state.searchesAt, [profileId]: Date.now() },
  }))
}

export function saveRecentSearch(profileId: string, query: string): void {
  const q = query.trim()
  if (q.length < 2) return
  setSearches(profileId, [q, ...loadRecentSearches(profileId).filter((old) => searchKey(old) !== searchKey(q))].slice(0, MAX_RECENT))
}

export function clearRecentSearches(profileId: string): void {
  setSearches(profileId, [])
}
