import type { FavoriteRef, FavoriteTeam, WatchProgress } from '../store/library'

/** O que vai para a nuvem de um perfil (favoritos, times, "continuar assistindo" e ja vistos). */
export interface SyncedProfile {
  favorites: FavoriteRef[]
  favoritesAt: number
  teams: FavoriteTeam[]
  teamsAt: number
  progress: Record<string, WatchProgress>
  removed: Record<string, number>
  watched: string[]
}

/** Uma conta inteira: perfis pelo nome (o id do perfil e diferente em cada aparelho, o nome nao). */
export type SyncBlob = Record<string, SyncedProfile>

export interface LibraryRecords {
  favorites: Record<string, FavoriteRef[]>
  favoritesAt: Record<string, number>
  favoriteTeams: Record<string, FavoriteTeam[]>
  teamsAt: Record<string, number>
  progress: Record<string, WatchProgress>
  progressRemoved: Record<string, number>
  watched: Record<string, true>
}

const TOMBSTONE_MS = 60 * 24 * 60 * 60 * 1000

export const profileSyncName = (name: string) => name.trim().toLowerCase()

/** Lista inteira, ultimo vence. Sem data local (aparelho que nunca sincronizou, dados de antes disto) junta as duas,
 * para a primeira sincronizacao nao apagar nada que so existia aqui. */
function mergeList<T>(local: T[], localAt: number, remote: T[], remoteAt: number, same: (a: T, b: T) => boolean): [T[], number] {
  if (localAt) return localAt >= remoteAt ? [local, localAt] : [remote, remoteAt]
  const extra = local.filter((item) => !remote.some((r) => same(r, item)))
  return extra.length ? [[...remote, ...extra], Date.now()] : [remote, remoteAt]
}

export function mergeProfile(local: SyncedProfile, remote: SyncedProfile | undefined, now = Date.now()): SyncedProfile {
  if (!remote) return local
  const [favorites, favoritesAt] = mergeList(local.favorites, local.favoritesAt, remote.favorites ?? [], remote.favoritesAt ?? 0, (a, b) => a.kind === b.kind && a.id === b.id)
  const [teams, teamsAt] = mergeList(local.teams, local.teamsAt, remote.teams ?? [], remote.teamsAt ?? 0, (a, b) => a.slug === b.slug)
  const removed: Record<string, number> = {}
  for (const [key, at] of [...Object.entries(remote.removed ?? {}), ...Object.entries(local.removed)]) {
    if (now - at < TOMBSTONE_MS && at > (removed[key] ?? 0)) removed[key] = at
  }
  const progress: Record<string, WatchProgress> = {}
  for (const [key, entry] of [...Object.entries(remote.progress ?? {}), ...Object.entries(local.progress)]) {
    if (entry.updatedAt > (removed[key] ?? 0) && entry.updatedAt >= (progress[key]?.updatedAt ?? 0)) progress[key] = entry
  }
  const watched = [...new Set([...(remote.watched ?? []), ...local.watched])]
  return { favorites, favoritesAt, teams, teamsAt, progress, removed, watched }
}

function scoped<T>(record: Record<string, T>, profileId: string): Record<string, T> {
  const prefix = `${profileId}:`
  const out: Record<string, T> = {}
  for (const [key, value] of Object.entries(record)) if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value
  return out
}

export function extractProfile(state: LibraryRecords, profileId: string): SyncedProfile {
  return {
    favorites: state.favorites[profileId] ?? [],
    favoritesAt: state.favoritesAt[profileId] ?? 0,
    teams: state.favoriteTeams[profileId] ?? [],
    teamsAt: state.teamsAt[profileId] ?? 0,
    progress: scoped(state.progress, profileId),
    removed: scoped(state.progressRemoved, profileId),
    watched: Object.keys(scoped(state.watched, profileId)),
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
    favorites: { ...state.favorites, [profileId]: p.favorites },
    favoritesAt: { ...state.favoritesAt, [profileId]: p.favoritesAt },
    favoriteTeams: { ...state.favoriteTeams, [profileId]: p.teams },
    teamsAt: { ...state.teamsAt, [profileId]: p.teamsAt },
    progress: replace(state.progress, p.progress),
    progressRemoved: replace(state.progressRemoved, p.removed),
    watched: replace(state.watched, Object.fromEntries(p.watched.map((k) => [k, true as const]))),
  }
}
