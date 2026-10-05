export interface XtreamCredentials {
  baseUrl: string
  username: string
  password: string
}

/** Discriminated union of every login method the app accepts. A saved/persisted credentials object
 * without a `type` field predates this union and is always Xtream (see `normalizeProviderCredentials`). */
export type ProviderCredentials =
  | ({ type: 'xtream' } & XtreamCredentials)
  // `epgUrl` is the XMLTV guide the playlist declared on its own #EXTM3U header. Optional, and absent on
  // sessions saved before it was read, which simply means no guide until the next sign-in.
  | { type: 'm3u'; source: 'url'; url: string; epgUrl?: string }
  | { type: 'm3u'; source: 'file'; fileName: string; epgUrl?: string }

export interface UserInfo {
  username: string
  status: string
  expDate: string | null
  isTrial: boolean
  activeConnections: string
  maxConnections: string
}

export interface ServerInfo {
  url: string
  serverName: string
  timezone: string
}

export interface Category {
  categoryId: string
  categoryName: string
}

export interface LiveChannel {
  kind: 'live'
  streamId: number
  name: string
  streamIcon: string | null
  categoryId: string
  epgChannelId: string | null
  /** Whether this channel's provider keeps a rewind/catch-up buffer at all, and for how long. */
  hasArchive: boolean
  archiveDurationHours: number
}

export interface Movie {
  kind: 'movie'
  streamId: number
  name: string
  streamIcon: string | null
  categoryId: string
  rating: string | null
  added: string | null
  containerExtension: string
}

export interface MovieDetails extends Movie {
  plot: string | null
  cast: string | null
  director: string | null
  genre: string | null
  releaseDate: string | null
  duration: string | null
  backdropPath: string[]
}

export interface SeriesItem {
  kind: 'series'
  seriesId: number
  name: string
  cover: string | null
  categoryId: string
  rating: string | null
  plot: string | null
  genre: string | null
  releaseDate: string | null
  backdropPath: string[]
  cast: string | null
  director: string | null
}

export interface Episode {
  id: string
  episodeNum: number
  title: string
  containerExtension: string
  plot: string | null
  duration: string | null
  season: number
}

export interface SeriesDetails extends SeriesItem {
  seasons: {
    seasonNumber: number
    name: string
    overview: string | null
    cover: string | null
    episodes: Episode[]
  }[]
}

export interface EpgProgram {
  id: string
  title: string
  description: string
  start: string
  end: string
  /** Unix seconds — undefined for the short (now/next) EPG, which the grid/catch-up view don't use. */
  startTimestamp?: number
  endTimestamp?: number
  /** True when the provider says this specific past program can still be watched via catch-up. */
  hasArchive?: boolean
}

export type CatalogItem = LiveChannel | Movie | SeriesItem
