import type { FavoriteRef, FavoriteTeam, SeriesDone, WatchProgress } from '../store/library'
import type { Profile } from '../store/profiles'

/** O perfil em si: o que aparece em "Gerenciar perfis" e as categorias que ele escondeu ou reordenou. */
export type ProfileSettings = Pick<Profile, 'name' | 'color' | 'isKids' | 'pin' | 'hiddenCategories' | 'categoryOrder'>

/** O que vai para a nuvem de um perfil. Os campos opcionais nao existiam na primeira versao do sync. */
export interface SyncedProfile {
  favorites: FavoriteRef[]
  favoritesAt: number
  teams: FavoriteTeam[]
  teamsAt: number
  progress: Record<string, WatchProgress>
  removed: Record<string, number>
  watched: string[]
  /** Quando cada visto foi marcado e quando foi desmarcado; ausentes na primeira versao do sync. */
  watchedAt?: Record<string, number>
  unwatched?: Record<string, number>
  /** Por seriesId; o mais novo (`at`) vence. */
  seriesDone?: Record<string, SeriesDone>
  recentLive?: number[]
  recentLiveAt?: number
  searches?: string[]
  searchesAt?: number
  settings?: ProfileSettings
  settingsAt?: number
  /** Perfil apagado em algum aparelho: os outros apagam tambem. */
  deletedAt?: number
}

/** Uma conta inteira, por chave do perfil (o `syncId`; na primeira versao era o nome em minusculas). */
export type SyncBlob = Record<string, SyncedProfile>

export interface LibraryRecords {
  favorites: Record<string, FavoriteRef[]>
  favoritesAt: Record<string, number>
  favoriteTeams: Record<string, FavoriteTeam[]>
  teamsAt: Record<string, number>
  progress: Record<string, WatchProgress>
  progressRemoved: Record<string, number>
  watched: Record<string, true>
  watchedAt: Record<string, number>
  watchedRemoved: Record<string, number>
  seriesDone: Record<string, SeriesDone>
  recentLive: Record<string, number[]>
  recentLiveAt: Record<string, number>
  searches: Record<string, string[]>
  searchesAt: Record<string, number>
}

// shortcut: marca de "tirado do continuar assistindo" some em 60 dias; um aparelho parado mais que isso pode trazer o item de volta.
const TOMBSTONE_MS = 60 * 24 * 60 * 60 * 1000

export const profileSyncName = (name: string) => name.trim().toLowerCase()

/** Lista inteira, ultimo vence. Sem data local (aparelho que nunca sincronizou, dados de antes disto) junta as duas,
 * para a primeira sincronizacao nao apagar nada que so existia aqui. */
function mergeList<T>(local: T[], localAt: number, remote: T[], remoteAt: number, same: (a: T, b: T) => boolean): [T[], number] {
  if (localAt) return localAt >= remoteAt ? [local, localAt] : [remote, remoteAt]
  const extra = local.filter((item) => !remote.some((r) => same(r, item)))
  return extra.length ? [[...remote, ...extra], Date.now()] : [remote, remoteAt]
}

/** Mesma regra para o perfil. Sem data local junta pelo lado seguro: infantil se algum lado for, PIN de quem tiver,
 * categorias escondidas dos dois. */
function mergeSettings(local: ProfileSettings, localAt: number, remote: ProfileSettings | undefined, remoteAt: number): [ProfileSettings, number] {
  if (!remote || localAt) return localAt >= remoteAt || !remote ? [local, localAt] : [remote, remoteAt]
  const hidden = [...new Set([...(remote.hiddenCategories ?? []), ...(local.hiddenCategories ?? [])])]
  const merged: ProfileSettings = {
    ...remote,
    isKids: remote.isKids || local.isKids || undefined,
    pin: remote.pin ?? local.pin,
    hiddenCategories: hidden.length ? hidden : undefined,
    categoryOrder: remote.categoryOrder?.length ? remote.categoryOrder : local.categoryOrder,
  }
  return JSON.stringify(merged) === JSON.stringify(remote) ? [remote, remoteAt] : [merged, Date.now()]
}

const sameValue = <T,>(a: T, b: T) => a === b

export function mergeProfile(local: SyncedProfile, remote: SyncedProfile | undefined, now = Date.now()): SyncedProfile {
  if (!remote) return local
  const [favorites, favoritesAt] = mergeList(local.favorites, local.favoritesAt, remote.favorites ?? [], remote.favoritesAt ?? 0, (a, b) => a.kind === b.kind && a.id === b.id)
  const [teams, teamsAt] = mergeList(local.teams, local.teamsAt, remote.teams ?? [], remote.teamsAt ?? 0, (a, b) => a.slug === b.slug)
  const [recentLive, recentLiveAt] = mergeList(local.recentLive ?? [], local.recentLiveAt ?? 0, remote.recentLive ?? [], remote.recentLiveAt ?? 0, sameValue)
  const [searches, searchesAt] = mergeList(local.searches ?? [], local.searchesAt ?? 0, remote.searches ?? [], remote.searchesAt ?? 0, sameValue)
  const [settings, settingsAt] = local.settings ? mergeSettings(local.settings, local.settingsAt ?? 0, remote.settings, remote.settingsAt ?? 0) : [remote.settings, remote.settingsAt]
  const removed: Record<string, number> = {}
  for (const [key, at] of [...Object.entries(remote.removed ?? {}), ...Object.entries(local.removed)]) {
    if (now - at < TOMBSTONE_MS && at > (removed[key] ?? 0)) removed[key] = at
  }
  const progress: Record<string, WatchProgress> = {}
  for (const [key, entry] of [...Object.entries(remote.progress ?? {}), ...Object.entries(local.progress)]) {
    if (entry.updatedAt > (removed[key] ?? 0) && entry.updatedAt >= (progress[key]?.updatedAt ?? 0)) progress[key] = entry
  }
  const watchedAt: Record<string, number> = {}
  for (const [key, at] of [...Object.entries(remote.watchedAt ?? {}), ...Object.entries(local.watchedAt ?? {})]) {
    if (at > (watchedAt[key] ?? 0)) watchedAt[key] = at
  }
  const unwatched: Record<string, number> = {}
  for (const [key, at] of [...Object.entries(remote.unwatched ?? {}), ...Object.entries(local.unwatched ?? {})]) {
    if (now - at < TOMBSTONE_MS && at > (unwatched[key] ?? 0) && at >= (watchedAt[key] ?? 0)) unwatched[key] = at
  }
  // Visto sem data (antes disto) perde para qualquer desmarcacao; marcado de novo depois dela, volta.
  const watched = [...new Set([...(remote.watched ?? []), ...local.watched])].filter((key) => !unwatched[key])
  const seriesDone: Record<string, SeriesDone> = {}
  for (const [key, entry] of [...Object.entries(remote.seriesDone ?? {}), ...Object.entries(local.seriesDone ?? {})]) {
    if (entry.at >= (seriesDone[key]?.at ?? 0)) seriesDone[key] = entry
  }
  return {
    favorites,
    favoritesAt,
    teams,
    teamsAt,
    progress,
    removed,
    watched,
    watchedAt: Object.fromEntries(Object.entries(watchedAt).filter(([key]) => !unwatched[key])),
    unwatched,
    seriesDone,
    recentLive: recentLive.slice(0, 20),
    recentLiveAt,
    searches: searches.slice(0, 8),
    searchesAt,
    settings,
    settingsAt,
  }
}

/** Qual chave da nuvem e de cada perfil daqui: a que ele ja tem; senao a de um perfil com o mesmo nome (o primeiro
 * perfil nasce com o nome do usuario em todo aparelho); senao o proprio id, como perfil novo. */
export function claimKeys(profiles: Pick<Profile, 'id' | 'name' | 'syncId'>[], remote: SyncBlob): Record<string, string> {
  const claims: Record<string, string> = {}
  const taken = new Set(profiles.flatMap((p) => (p.syncId ? [p.syncId] : [])))
  for (const p of profiles) {
    if (p.syncId) {
      claims[p.id] = p.syncId
      continue
    }
    const match = Object.entries(remote).find(
      ([key, entry]) => !taken.has(key) && !entry.deletedAt && profileSyncName(entry.settings?.name ?? key) === profileSyncName(p.name),
    )?.[0]
    claims[p.id] = match ?? p.id
    taken.add(claims[p.id])
  }
  return claims
}

function scoped<T>(record: Record<string, T>, profileId: string): Record<string, T> {
  const prefix = `${profileId}:`
  const out: Record<string, T> = {}
  for (const [key, value] of Object.entries(record)) if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value
  return out
}

export function extractProfile(state: LibraryRecords, profileId: string, profile?: Profile): SyncedProfile {
  return {
    favorites: state.favorites[profileId] ?? [],
    favoritesAt: state.favoritesAt[profileId] ?? 0,
    teams: state.favoriteTeams[profileId] ?? [],
    teamsAt: state.teamsAt[profileId] ?? 0,
    progress: scoped(state.progress, profileId),
    removed: scoped(state.progressRemoved, profileId),
    watched: Object.keys(scoped(state.watched, profileId)),
    watchedAt: scoped(state.watchedAt, profileId),
    unwatched: scoped(state.watchedRemoved, profileId),
    seriesDone: scoped(state.seriesDone, profileId),
    recentLive: state.recentLive[profileId] ?? [],
    recentLiveAt: state.recentLiveAt[profileId] ?? 0,
    searches: state.searches[profileId] ?? [],
    searchesAt: state.searchesAt[profileId] ?? 0,
    ...(profile && {
      settings: {
        name: profile.name,
        color: profile.color,
        isKids: profile.isKids,
        pin: profile.pin,
        hiddenCategories: profile.hiddenCategories,
        categoryOrder: profile.categoryOrder,
      },
      settingsAt: profile.updatedAt ?? 0,
    }),
  }
}

/** Troca so as chaves do perfil, sem mexer nos outros. */
export function applyProfile(state: LibraryRecords, profileId: string, p: SyncedProfile): LibraryRecords {
  const prefix = `${profileId}:`
  const replace = <T,>(record: Record<string, T>, mine: Record<string, T>) => {
    const out: Record<string, T> = {}
    for (const [key, value] of Object.entries(record)) if (!key.startsWith(prefix)) out[key] = value
    for (const [key, value] of Object.entries(mine)) out[prefix + key] = value
    return out
  }
  return {
    favorites: { ...state.favorites, [profileId]: p.favorites ?? [] },
    favoritesAt: { ...state.favoritesAt, [profileId]: p.favoritesAt ?? 0 },
    favoriteTeams: { ...state.favoriteTeams, [profileId]: p.teams ?? [] },
    teamsAt: { ...state.teamsAt, [profileId]: p.teamsAt ?? 0 },
    progress: replace(state.progress, p.progress ?? {}),
    progressRemoved: replace(state.progressRemoved, p.removed ?? {}),
    watched: replace(state.watched, Object.fromEntries((p.watched ?? []).map((k) => [k, true as const]))),
    watchedAt: replace(state.watchedAt, p.watchedAt ?? {}),
    watchedRemoved: replace(state.watchedRemoved, p.unwatched ?? {}),
    seriesDone: replace(state.seriesDone, p.seriesDone ?? {}),
    recentLive: { ...state.recentLive, [profileId]: p.recentLive ?? [] },
    recentLiveAt: { ...state.recentLiveAt, [profileId]: p.recentLiveAt ?? 0 },
    searches: { ...state.searches, [profileId]: p.searches ?? [] },
    searchesAt: { ...state.searchesAt, [profileId]: p.searchesAt ?? 0 },
  }
}
