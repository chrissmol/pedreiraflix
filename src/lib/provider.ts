import type {
  Category,
  EpgProgram,
  LiveChannel,
  Movie,
  MovieDetails,
  SeriesDetails,
  SeriesItem,
  ServerInfo,
  UserInfo,
} from '../types'

/** The interface every catalog page, the player and downloads/parental-control code actually depend on.
 * `XtreamClient` and `M3uClient` both implement it, so the rest of the app never needs to know which
 * provider a session is talking to. */
export interface ProviderClient {
  login(): Promise<{ user: UserInfo; server: ServerInfo }>
  getLiveCategories(): Promise<Category[]>
  getVodCategories(): Promise<Category[]>
  getSeriesCategories(): Promise<Category[]>
  getLiveStreams(categoryId?: string): Promise<LiveChannel[]>
  getVodStreams(categoryId?: string): Promise<Movie[]>
  getVodInfo(vodId: number): Promise<MovieDetails>
  getSeries(categoryId?: string): Promise<SeriesItem[]>
  getSeriesInfo(seriesId: number): Promise<SeriesDetails>
  getShortEpg(streamId: number, limit?: number): Promise<EpgProgram[]>
  getFullEpg(streamId: number): Promise<EpgProgram[]>
  streamUrl(kind: 'live' | 'movie' | 'series', id: number | string, ext?: string): string
  timeshiftUrl(streamId: number, startUnixSeconds: number, durationMinutes: number): string
  downloadUrl(kind: 'movie' | 'series', id: number | string, ext: string, filename: string): string
}
