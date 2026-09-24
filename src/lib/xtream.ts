import { xtreamQueue } from './requestQueue'
import type {
  Category,
  Episode,
  EpgProgram,
  LiveChannel,
  Movie,
  MovieDetails,
  SeriesDetails,
  SeriesItem,
  ServerInfo,
  UserInfo,
  XtreamCredentials,
} from '../types'

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (typeof value === 'string' && value.trim()) return [value]
  return []
}

export class XtreamApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

export class XtreamClient {
  private creds: XtreamCredentials

  constructor(creds: XtreamCredentials) {
    this.creds = creds
  }

  private async call<T>(action: string | null, params: Record<string, string> = {}): Promise<T> {
    const query = new URLSearchParams({
      base: this.creds.baseUrl,
      path: 'player_api.php',
      username: this.creds.username,
      password: this.creds.password,
      ...(action ? { action } : {}),
      ...params,
    })
    const res = await xtreamQueue.schedule(() => fetch(`/api/xtream?${query.toString()}`))
    if (res.status === 429) {
      // The provider is telling us our current pacing is still too fast for
      // its rate limiter — widen the gap between every future request
      // app-wide so subsequent categories back off automatically instead of
      // repeating the same mistake for the rest of the session.
      xtreamQueue.setGap(1500)
    }
    if (!res.ok) throw new XtreamApiError(`Xtream request failed: ${res.status}`, res.status)
    const data = await res.json()
    if (data && typeof data === 'object' && 'user_info' in data) {
      const info = (data as { user_info?: { auth?: number } }).user_info
      if (info && info.auth === 0) throw new XtreamApiError('Credenciais inválidas')
    }
    return data as T
  }

  async login(): Promise<{ user: UserInfo; server: ServerInfo }> {
    const data = await this.call<{
      user_info: {
        username: string
        status: string
        exp_date: string | null
        is_trial: string
        active_cons: string
        max_connections: string
        auth: number
      }
      server_info: { url: string; server_protocol?: string; server_name?: string; timezone: string }
    }>(null)

    if (!data.user_info || data.user_info.auth !== 1) {
      throw new XtreamApiError('Credenciais inválidas ou servidor indisponível')
    }

    return {
      user: {
        username: data.user_info.username,
        status: data.user_info.status,
        expDate: data.user_info.exp_date,
        isTrial: data.user_info.is_trial === '1',
        activeConnections: data.user_info.active_cons,
        maxConnections: data.user_info.max_connections,
      },
      server: {
        url: data.server_info.url,
        serverName: data.server_info.server_name || data.server_info.url,
        timezone: data.server_info.timezone,
      },
    }
  }

  async getLiveCategories(): Promise<Category[]> {
    const raw = await this.call<{ category_id: string; category_name: string }[]>('get_live_categories')
    return raw.map((c) => ({ categoryId: c.category_id, categoryName: c.category_name }))
  }

  async getVodCategories(): Promise<Category[]> {
    const raw = await this.call<{ category_id: string; category_name: string }[]>('get_vod_categories')
    return raw.map((c) => ({ categoryId: c.category_id, categoryName: c.category_name }))
  }

  async getSeriesCategories(): Promise<Category[]> {
    const raw = await this.call<{ category_id: string; category_name: string }[]>('get_series_categories')
    return raw.map((c) => ({ categoryId: c.category_id, categoryName: c.category_name }))
  }

  async getLiveStreams(categoryId?: string): Promise<LiveChannel[]> {
    const raw = await this.call<
      {
        stream_id: number
        name: string
        stream_icon: string | null
        category_id: string
        epg_channel_id: string | null
      }[]
    >('get_live_streams', categoryId ? { category_id: categoryId } : {})
    return raw.map((s) => ({
      kind: 'live',
      streamId: s.stream_id,
      name: s.name,
      streamIcon: s.stream_icon || null,
      categoryId: s.category_id,
      epgChannelId: s.epg_channel_id,
    }))
  }

  async getVodStreams(categoryId?: string): Promise<Movie[]> {
    const raw = await this.call<
      {
        stream_id: number
        name: string
        stream_icon: string | null
        category_id: string
        rating: string | null
        added: string | null
        container_extension: string
      }[]
    >('get_vod_streams', categoryId ? { category_id: categoryId } : {})
    return raw.map((s) => ({
      kind: 'movie',
      streamId: s.stream_id,
      name: s.name,
      streamIcon: s.stream_icon || null,
      categoryId: s.category_id,
      rating: s.rating,
      added: s.added,
      containerExtension: s.container_extension || 'mp4',
    }))
  }

  async getVodInfo(vodId: number): Promise<MovieDetails> {
    const data = await this.call<{
      info: {
        name: string
        plot: string | null
        cast: string | null
        director: string | null
        genre: string | null
        releasedate: string | null
        duration: string | null
        rating: string | null
        cover_big?: string | null
        movie_image?: string | null
        backdrop_path?: string[] | string | null
      }
      movie_data: { stream_id: number; category_id: string; container_extension: string }
    }>('get_vod_info', { vod_id: String(vodId) })

    return {
      kind: 'movie',
      streamId: data.movie_data.stream_id,
      name: data.info.name,
      streamIcon: data.info.movie_image || data.info.cover_big || null,
      categoryId: data.movie_data.category_id,
      rating: data.info.rating,
      added: null,
      containerExtension: data.movie_data.container_extension || 'mp4',
      plot: data.info.plot,
      cast: data.info.cast,
      director: data.info.director,
      genre: data.info.genre,
      releaseDate: data.info.releasedate,
      duration: data.info.duration,
      backdropPath: toStringArray(data.info.backdrop_path),
    }
  }

  async getSeries(categoryId?: string): Promise<SeriesItem[]> {
    const raw = await this.call<
      {
        series_id: number
        name: string
        cover: string | null
        category_id: string
        rating: string | null
        plot: string | null
        genre: string | null
        releaseDate: string | null
        release_date?: string | null
        backdrop_path?: string[] | string | null
        cast: string | null
        director: string | null
      }[]
    >('get_series', categoryId ? { category_id: categoryId } : {})
    return raw.map((s) => ({
      kind: 'series',
      seriesId: s.series_id,
      name: s.name,
      cover: s.cover || null,
      categoryId: s.category_id,
      rating: s.rating,
      plot: s.plot,
      genre: s.genre,
      releaseDate: s.release_date || s.releaseDate || null,
      backdropPath: toStringArray(s.backdrop_path),
      cast: s.cast,
      director: s.director,
    }))
  }

  async getSeriesInfo(seriesId: number): Promise<SeriesDetails> {
    const data = await this.call<{
      info: {
        name: string
        cover: string | null
        plot: string | null
        cast: string | null
        director: string | null
        genre: string | null
        release_date: string | null
        rating: string | null
        category_id: string
        backdrop_path?: string[] | string | null
      }
      seasons?: { season_number: number; name: string; overview: string | null; cover: string | null }[]
      episodes: Record<
        string,
        {
          id: string
          episode_num: number
          title: string
          container_extension: string
          info?: { plot?: string | null; duration?: string | null }
        }[]
      >
    }>('get_series_info', { series_id: String(seriesId) })

    const seasonMeta = new Map((data.seasons || []).map((s) => [s.season_number, s]))
    const seasons = Object.entries(data.episodes || {}).map(([seasonNumStr, episodes]) => {
      const seasonNumber = Number(seasonNumStr)
      const meta = seasonMeta.get(seasonNumber)
      const mappedEpisodes: Episode[] = episodes.map((e) => ({
        id: e.id,
        episodeNum: e.episode_num,
        title: e.title,
        containerExtension: e.container_extension || 'mp4',
        plot: e.info?.plot || null,
        duration: e.info?.duration || null,
        season: seasonNumber,
      }))
      return {
        seasonNumber,
        name: meta?.name || `Temporada ${seasonNumber}`,
        overview: meta?.overview || null,
        cover: meta?.cover || null,
        episodes: mappedEpisodes.sort((a, b) => a.episodeNum - b.episodeNum),
      }
    })
    seasons.sort((a, b) => a.seasonNumber - b.seasonNumber)

    return {
      kind: 'series',
      seriesId,
      name: data.info.name,
      cover: data.info.cover,
      categoryId: data.info.category_id,
      rating: data.info.rating,
      plot: data.info.plot,
      genre: data.info.genre,
      releaseDate: data.info.release_date,
      backdropPath: toStringArray(data.info.backdrop_path),
      cast: data.info.cast,
      director: data.info.director,
      seasons,
    }
  }

  async getShortEpg(streamId: number, limit = 2): Promise<EpgProgram[]> {
    const data = await this.call<{
      epg_listings?: {
        id: string
        title: string
        description: string
        start: string
        end: string
      }[]
    }>('get_short_epg', { stream_id: String(streamId), limit: String(limit) })

    function decodeBase64(value: string): string {
      try {
        return decodeURIComponent(escape(atob(value)))
      } catch {
        return value
      }
    }

    return (data.epg_listings || []).map((e) => ({
      id: e.id,
      title: decodeBase64(e.title),
      description: decodeBase64(e.description),
      start: e.start,
      end: e.end,
    }))
  }

  streamUrl(kind: 'live' | 'movie' | 'series', id: number | string, ext = 'm3u8'): string {
    const folder = kind === 'live' ? 'live' : kind === 'movie' ? 'movie' : 'series'
    const direct = `${this.creds.baseUrl}/${folder}/${this.creds.username}/${this.creds.password}/${id}.${ext}`
    return `/api/stream?url=${encodeURIComponent(direct)}`
  }

  /** Same file as streamUrl, but asks the proxy to send it as a "Save As" download instead of an inline stream. */
  downloadUrl(kind: 'movie' | 'series', id: number | string, ext: string, filename: string): string {
    const folder = kind === 'movie' ? 'movie' : 'series'
    const direct = `${this.creds.baseUrl}/${folder}/${this.creds.username}/${this.creds.password}/${id}.${ext}`
    const safeName = `${filename}.${ext}`.replace(/[/\\]/g, '_')
    return `/api/stream?url=${encodeURIComponent(direct)}&download=1&filename=${encodeURIComponent(safeName)}`
  }
}
