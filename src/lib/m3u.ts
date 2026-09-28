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
import type { ProviderClient } from './provider'
import { proxyImage } from './xtream'

// ponytail: name/group-title heuristic, not a real catalog API. It won't classify every provider's
// naming convention correctly; upgrade path is a manual "mudar categoria" override in the UI if this
// turns out to misfire a lot in practice.

export interface M3uEntry {
  id: number
  name: string
  logo: string | null
  group: string
  url: string
  kind: 'live' | 'movie' | 'series'
  /** Only set for `kind: 'series'` entries. */
  season?: number
  episode?: number
  /** Series name with the SxxExx suffix stripped, used to group episodes together. */
  seriesName?: string
}

const EPISODE_RE = /s(\d{1,2})\s?e(\d{1,3})/i
const MOVIE_WORDS = /\b(filme|filmes|movie|movies)\b/i
const SERIES_WORDS = /\b(s[ée]rie|s[ée]ries|series|temporada|season)\b/i

function attr(extinf: string, name: string): string | null {
  const m = extinf.match(new RegExp(`${name}="([^"]*)"`, 'i'))
  return m ? m[1] : null
}

/** Parses an `#EXTM3U` playlist into flat entries with a best-effort live/movie/series classification.
 * Malformed lines (no following URL, no #EXTINF) are skipped rather than throwing — M3U in the wild is
 * rarely fully spec-compliant. */
export function parseM3u(text: string): M3uEntry[] {
  const lines = text.split(/\r?\n/)
  const entries: M3uEntry[] = []
  let id = 1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('#EXTINF')) continue

    const name = line.slice(line.lastIndexOf(',') + 1).trim()
    const group = attr(line, 'group-title') || ''
    const logo = attr(line, 'tvg-logo')

    let j = i + 1
    while (j < lines.length && (!lines[j].trim() || lines[j].trim().startsWith('#'))) j++
    const url = lines[j]?.trim()
    if (!url || !name) continue
    i = j

    const epMatch = name.match(EPISODE_RE) || group.match(EPISODE_RE)
    let kind: M3uEntry['kind']
    let season: number | undefined
    let episode: number | undefined
    let seriesName: string | undefined

    if (epMatch) {
      kind = 'series'
      season = Number(epMatch[1])
      episode = Number(epMatch[2])
      seriesName = name.slice(0, epMatch.index).trim().replace(/[-–—:]+$/, '').trim() || name
    } else if (MOVIE_WORDS.test(group) || MOVIE_WORDS.test(name)) {
      kind = 'movie'
    } else if (SERIES_WORDS.test(group) || SERIES_WORDS.test(name)) {
      kind = 'series'
      seriesName = name
    } else {
      kind = 'live'
    }

    entries.push({ id: id++, name, logo, group: group || 'Sem categoria', url, kind, season, episode, seriesName })
  }

  return entries
}

function categoriesFor(entries: M3uEntry[], kind: M3uEntry['kind']): Category[] {
  const groups = new Set(entries.filter((e) => e.kind === kind).map((e) => e.group))
  return [...groups].map((g) => ({ categoryId: g, categoryName: g }))
}

/** Serves the same `ProviderClient` shape as `XtreamClient`, from an already-parsed M3U playlist held
 * entirely in memory. There's no real backing API, so everything the catalog asks for is just a filter
 * over `entries` — no network calls after construction. */
export class M3uClient implements ProviderClient {
  private entries: M3uEntry[]
  private byId: Map<number, M3uEntry>

  constructor(entries: M3uEntry[]) {
    this.entries = entries
    this.byId = new Map(entries.map((e) => [e.id, e]))
  }

  async login(): Promise<{ user: UserInfo; server: ServerInfo }> {
    return {
      user: { username: 'Playlist M3U', status: 'Active', expDate: null, isTrial: false, activeConnections: '1', maxConnections: '1' },
      server: { url: '', serverName: 'Playlist M3U', timezone: '' },
    }
  }

  async getLiveCategories(): Promise<Category[]> {
    return categoriesFor(this.entries, 'live')
  }

  async getVodCategories(): Promise<Category[]> {
    return categoriesFor(this.entries, 'movie')
  }

  async getSeriesCategories(): Promise<Category[]> {
    return categoriesFor(this.entries, 'series')
  }

  async getLiveStreams(categoryId?: string): Promise<LiveChannel[]> {
    return this.entries
      .filter((e) => e.kind === 'live' && (!categoryId || e.group === categoryId))
      .map((e) => ({
        kind: 'live',
        streamId: e.id,
        name: e.name,
        streamIcon: proxyImage(e.logo),
        categoryId: e.group,
        epgChannelId: null,
        hasArchive: false,
        archiveDurationHours: 0,
      }))
  }

  async getVodStreams(categoryId?: string): Promise<Movie[]> {
    return this.entries
      .filter((e) => e.kind === 'movie' && (!categoryId || e.group === categoryId))
      .map((e) => this.toMovie(e))
  }

  private toMovie(e: M3uEntry): Movie {
    return {
      kind: 'movie',
      streamId: e.id,
      name: e.name,
      streamIcon: proxyImage(e.logo),
      categoryId: e.group,
      rating: null,
      added: null,
      containerExtension: e.url.split('.').pop()?.split('?')[0] || 'mp4',
    }
  }

  async getVodInfo(vodId: number): Promise<MovieDetails> {
    const e = this.byId.get(vodId)
    if (!e) throw new Error('Item não encontrado na playlist')
    return { ...this.toMovie(e), plot: null, cast: null, director: null, genre: null, releaseDate: null, duration: null, backdropPath: [] }
  }

  /** Groups every `kind: 'series'` entry that shares a series name into one series item — the same
   * grouping key doubles as the synthetic series id everywhere else in this class. */
  private seriesGroups(): Map<string, M3uEntry[]> {
    const groups = new Map<string, M3uEntry[]>()
    for (const e of this.entries) {
      if (e.kind !== 'series') continue
      const key = e.seriesName || e.name
      const list = groups.get(key)
      if (list) list.push(e)
      else groups.set(key, [e])
    }
    return groups
  }

  async getSeries(categoryId?: string): Promise<SeriesItem[]> {
    const out: SeriesItem[] = []
    for (const [name, eps] of this.seriesGroups()) {
      const first = eps[0]
      if (categoryId && first.group !== categoryId) continue
      out.push({
        kind: 'series',
        seriesId: first.id,
        name,
        cover: proxyImage(first.logo),
        categoryId: first.group,
        rating: null,
        plot: null,
        genre: null,
        releaseDate: null,
        backdropPath: [],
        cast: null,
        director: null,
      })
    }
    return out
  }

  async getSeriesInfo(seriesId: number): Promise<SeriesDetails> {
    const anchor = this.byId.get(seriesId)
    if (!anchor) throw new Error('Série não encontrada na playlist')
    const key = anchor.seriesName || anchor.name
    const eps = this.seriesGroups().get(key) || [anchor]

    const bySeason = new Map<number, M3uEntry[]>()
    for (const e of eps) {
      const season = e.season ?? 1
      const list = bySeason.get(season)
      if (list) list.push(e)
      else bySeason.set(season, [e])
    }
    const seasons = [...bySeason.entries()]
      .sort(([a], [b]) => a - b)
      .map(([seasonNumber, seasonEps]) => ({
        seasonNumber,
        name: `Temporada ${seasonNumber}`,
        overview: null,
        cover: null,
        episodes: seasonEps
          .map((e) => ({
            id: String(e.id),
            episodeNum: e.episode ?? 1,
            title: e.name,
            containerExtension: e.url.split('.').pop()?.split('?')[0] || 'mp4',
            plot: null,
            duration: null,
            season: seasonNumber,
          }))
          .sort((a, b) => a.episodeNum - b.episodeNum),
      }))

    return {
      kind: 'series',
      seriesId,
      name: key,
      cover: proxyImage(anchor.logo),
      categoryId: anchor.group,
      rating: null,
      plot: null,
      genre: null,
      releaseDate: null,
      backdropPath: [],
      cast: null,
      director: null,
      seasons,
    }
  }

  // M3U carries no EPG — the guide/catch-up UI already treats an empty list as "not available".
  async getShortEpg(): Promise<EpgProgram[]> {
    return []
  }

  async getFullEpg(): Promise<EpgProgram[]> {
    return []
  }

  streamUrl(_kind: 'live' | 'movie' | 'series', id: number | string): string {
    const e = this.byId.get(Number(id))
    return e ? proxyImage(e.url) || e.url : ''
  }

  // No catch-up data in M3U; nothing calls this because every channel reports hasArchive: false.
  timeshiftUrl(): string {
    throw new Error('Catch-up não é suportado para playlists M3U')
  }

  downloadUrl(_kind: 'movie' | 'series', id: number | string, ext: string, filename: string): string {
    const e = this.byId.get(Number(id))
    if (!e) return ''
    const safeName = `${filename}.${ext}`.replace(/[/\\]/g, '_')
    return `/api/stream?url=${encodeURIComponent(e.url)}&download=1&filename=${encodeURIComponent(safeName)}`
  }
}
