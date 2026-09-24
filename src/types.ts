export interface XtreamCredentials {
  baseUrl: string
  username: string
  password: string
}

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
}

export type CatalogItem = LiveChannel | Movie | SeriesItem
