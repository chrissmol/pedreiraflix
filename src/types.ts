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
  /** Numero do canal no provedor (`num` no Xtream, `tvg-chno` na M3U), para digitar no controle. */
  num?: number
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
  /** Só alguns painéis mandam o ano na lista; os outros põem no nome ("Duna (2024)"), ver movieYear. */
  year?: string | null
  /** A mesma obra cadastrada mais de uma vez pelo provedor (dublado, legendado, 4K), ver lib/versions. */
  versions?: Movie[]
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
  /** A mesma serie cadastrada mais de uma vez pelo provedor (dublada, legendada), ver lib/versions. */
  versions?: SeriesItem[]
}

export interface Episode {
  id: string
  episodeNum: number
  title: string
  containerExtension: string
  plot: string | null
  duration: string | null
  season: number
  /** Miniatura do episodio (info.movie_image do Xtream), quando o provedor manda. */
  image: string | null
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
