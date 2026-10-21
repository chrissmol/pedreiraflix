import type { ProviderClient } from './provider'
import { xtreamQueue } from './requestQueue.ts'
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

function decodeEpgText(value: string): string {
  try {
    return decodeURIComponent(escape(atob(value)))
  } catch {
    return value
  }
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (typeof value === 'string' && value.trim()) return [value]
  return []
}

// Many Xtream panels serve poster/thumbnail images over plain HTTP, or with a TLS certificate that
// doesn't match the image host (common on smaller/shadier providers). Loading them directly from the
// browser either gets silently upgraded-and-blocked as mixed content, or fails outright with
// ERR_CERT_COMMON_NAME_INVALID — and unlike video, there's no player error state to recover from; the
// poster is just permanently broken. Routing through our own proxy (already used for video/EPG) sidesteps
// both: the browser only ever talks to our own HTTPS origin, and the proxy fetches the original URL as-is.
export function proxyImage(url: string | null | undefined): string | null {
  if (!url) return null
  if (!/^https?:\/\//i.test(url)) return url // data:/blob:/relative — nothing to proxy
  return `/api/stream?url=${encodeURIComponent(url)}`
}

// O que o app baixa em massa sozinho (listas de cada categoria e guia). Todo o resto — detalhes de filme e
// serie, login, listas de categorias — e alguem esperando na tela, e fura a fila (ver requestQueue.ts).
const BACKGROUND_ACTIONS = new Set(['get_vod_streams', 'get_series', 'get_live_streams', 'get_short_epg', 'get_simple_data_table'])

// Codigo cifrado que substitui usuario e senha nas URLs de video (ver worker/streamSession.js). Guardado no
// aparelho, por conta, para a primeira URL ja sair sem a senha ao reabrir o app; renovado a cada login.
const SID_STORE = 'pf-stream-sid'
const sidKey = (c: XtreamCredentials) => `${c.baseUrl}|${c.username}`

function readSids(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SID_STORE) || '{}')
  } catch {
    return {}
  }
}

function writeSid(c: XtreamCredentials, sid: string | null) {
  try {
    const all = readSids()
    if (sid) all[sidKey(c)] = sid
    else delete all[sidKey(c)]
    localStorage.setItem(SID_STORE, JSON.stringify(all))
  } catch {
    // Sem storage (aba privada): as URLs seguem no formato antigo, o video toca igual.
  }
}

export const NOT_AVAILABLE = 'Este título não está mais disponível no provedor.'

export class XtreamApiError extends Error {
  status?: number
  /** 'html': o provedor (ou o Cloudflare na frente dele) respondeu uma pagina em vez dos dados. */
  kind?: 'html'
  constructor(message: string, status?: number, kind?: 'html') {
    super(message)
    this.status = status
    this.kind = kind
  }
}

export class XtreamClient implements ProviderClient {
  private creds: XtreamCredentials

  constructor(creds: XtreamCredentials) {
    this.creds = creds
  }

  /** Diagnostico (tela /diagnostico): uma chamada ao provedor SEM interpretar a resposta — status, tipo, tempo e o
   * comeco do corpo, para ver o que um aparelho de verdade recebe. */
  async probe(action: string | null, params: Record<string, string> = {}) {
    const query = new URLSearchParams({ base: this.creds.baseUrl, path: 'player_api.php', ...(action ? { action } : {}), ...params })
    const started = performance.now()
    const res = await fetch(`/api/xtream?${query.toString()}`, {
      headers: { 'x-xtream-username': this.creds.username, 'x-xtream-password': this.creds.password },
    })
    const text = await res.text()
    return { status: res.status, type: res.headers.get('content-type') || '', ms: Math.round(performance.now() - started), bytes: text.length, text, retryAfter: res.headers.get('retry-after') }
  }

  /** Diagnostico: os primeiros bytes do video (o mesmo pedido que o download faz). */
  async probeStream(kind: 'movie' | 'series', id: number | string, ext: string) {
    const started = performance.now()
    const res = await fetch(this.streamUrl(kind, id, ext), { headers: { range: 'bytes=0-1023' } })
    const buf = new Uint8Array(await res.arrayBuffer())
    return {
      status: res.status,
      type: res.headers.get('content-type') || '',
      range: res.headers.get('content-range') || '',
      ms: Math.round(performance.now() - started),
      bytes: buf.length,
      text: new TextDecoder().decode(buf.slice(0, 120)),
    }
  }

  /** Diagnostico: a lista de um canal ao vivo. Canal que o provedor bloqueia chega como lista "fechada" (1 trecho
   * + #EXT-X-ENDLIST, no lugar do canal) ou como recusa (HTTP 403/404, ex.: "error code: 1003" da Cloudflare). */
  async probeLive(id: number | string) {
    const started = performance.now()
    let res = await fetch(this.streamUrl('live', id, 'm3u8'))
    let text = await res.text()
    // Lista mestra: segue para a primeira variante, que e a que diz se o canal esta vivo.
    if (res.ok && /#EXT-X-STREAM-INF/.test(text)) {
      const next = text.split('\n').find((l) => l.trim() && !l.startsWith('#'))
      if (next) {
        res = await fetch(next.trim())
        text = await res.text()
      }
    }
    const media = text.split('\n').find((l) => l.trim() && !l.startsWith('#'))
    let host: string | null = null
    try {
      const u = media ? new URL(media.trim(), location.origin) : null
      host = u ? new URL(u.searchParams.get('url') || u.toString()).host : null
    } catch {
      // linha de trecho sem endereco legivel: so nao mostra o servidor
    }
    return {
      status: res.status,
      ms: Math.round(performance.now() - started),
      closed: /#EXT-X-ENDLIST/.test(text),
      segments: (text.match(/#EXTINF/g) || []).length,
      host,
      text: text.slice(0, 120),
    }
  }

  private async call<T>(action: string | null, params: Record<string, string> = {}): Promise<T> {
    // Usuario e senha vao em cabecalhos, nao na URL: a URL aparece no console, na aba Rede e em logs.
    const query = new URLSearchParams({
      base: this.creds.baseUrl,
      path: 'player_api.php',
      ...(action ? { action } : {}),
      ...params,
    })
    const headers = { 'x-xtream-username': this.creds.username, 'x-xtream-password': this.creds.password }
    const res = await xtreamQueue.schedule(
      () => fetch(`/api/xtream?${query.toString()}`, { headers }),
      action && BACKGROUND_ACTIONS.has(action) ? 'background' : 'urgent',
      // A programacao dos canais e enfeite: com o provedor limitando, nem pede (cada pedido gasta a cota que faria
      // os canais carregarem — 10 429 seguidos so de programacao no console do Christian, 09/10).
      action === 'get_short_epg' ? () => (xtreamQueue.degraded ? new XtreamApiError('Programação em pausa: o provedor está limitando os pedidos', 429) : null) : undefined,
    )
    if (res.status === 429) {
      // The provider is telling us our current pacing is still too fast for its rate limiter — widen
      // the gap between every future request app-wide so subsequent categories back off automatically
      // instead of repeating the same mistake. Eases back toward the normal pace after a streak of
      // clean requests (see requestQueue.ts) rather than staying defensive for the rest of the session.
      const retryAfter = Number(res.headers.get('retry-after'))
      xtreamQueue.reportRateLimited(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined)
    } else {
      xtreamQueue.reportSuccess()
    }
    if (!res.ok) throw new XtreamApiError(`Xtream request failed: ${res.status}`, res.status)
    const text = await res.text()
    // Bloqueio/erro do provedor ou do Cloudflare dele vem como pagina com status 200: sem isto o app falhava em
    // silencio e a tela ficava vazia (app do Windows do Christian, 09/10).
    if (/^\s*</.test(text)) throw new XtreamApiError('O provedor respondeu uma página em vez dos dados', res.status, 'html')
    const data = JSON.parse(text)
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
    await this.refreshStreamSession()

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
        tv_archive?: number | string
        tv_archive_duration?: number | string
      }[]
    >('get_live_streams', categoryId ? { category_id: categoryId } : {})
    return raw.map((s) => ({
      kind: 'live',
      streamId: s.stream_id,
      name: s.name,
      streamIcon: proxyImage(s.stream_icon),
      categoryId: s.category_id,
      epgChannelId: s.epg_channel_id,
      hasArchive: Number(s.tv_archive) === 1,
      archiveDurationHours: Number(s.tv_archive_duration) || 0,
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
        year?: string | null
      }[]
    >('get_vod_streams', categoryId ? { category_id: categoryId } : {})
    return raw.map((s) => ({
      kind: 'movie',
      streamId: s.stream_id,
      name: s.name,
      streamIcon: proxyImage(s.stream_icon),
      categoryId: s.category_id,
      rating: s.rating,
      added: s.added,
      containerExtension: s.container_extension || 'mp4',
      year: s.year,
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
    // Filme que o provedor tirou do ar: ele responde "[]" (ou info vazio) em vez de um erro.
    if (!data.info?.name || !data.movie_data) throw new XtreamApiError(NOT_AVAILABLE, 404)

    return {
      kind: 'movie',
      streamId: data.movie_data.stream_id,
      name: data.info.name,
      streamIcon: proxyImage(data.info.movie_image || data.info.cover_big),
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
      backdropPath: toStringArray(data.info.backdrop_path).map((u) => proxyImage(u)!),
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
      cover: proxyImage(s.cover),
      categoryId: s.category_id,
      rating: s.rating,
      plot: s.plot,
      genre: s.genre,
      releaseDate: s.release_date || s.releaseDate || null,
      backdropPath: toStringArray(s.backdrop_path).map((u) => proxyImage(u)!),
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
          info?: { plot?: string | null; duration?: string | null; movie_image?: string | null }
        }[]
      >
    }>('get_series_info', { series_id: String(seriesId) })
    // Serie que o provedor tirou do ar: info vem vazio e a pagina quebrava ao renderizar o nome.
    if (!data.info?.name) throw new XtreamApiError(NOT_AVAILABLE, 404)

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
        image: proxyImage(e.info?.movie_image),
      }))
      return {
        seasonNumber,
        name: meta?.name || `Temporada ${seasonNumber}`,
        overview: meta?.overview || null,
        cover: proxyImage(meta?.cover),
        episodes: mappedEpisodes.sort((a, b) => a.episodeNum - b.episodeNum),
      }
    })
    seasons.sort((a, b) => a.seasonNumber - b.seasonNumber)

    return {
      kind: 'series',
      seriesId,
      name: data.info.name,
      cover: proxyImage(data.info.cover),
      categoryId: data.info.category_id,
      rating: data.info.rating,
      plot: data.info.plot,
      genre: data.info.genre,
      releaseDate: data.info.release_date,
      backdropPath: toStringArray(data.info.backdrop_path).map((u) => proxyImage(u)!),
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

    return (data.epg_listings || []).map((e) => ({
      id: e.id,
      title: decodeEpgText(e.title),
      description: decodeEpgText(e.description),
      start: e.start,
      end: e.end,
    }))
  }

  /** The channel's whole EPG "day" (~24h, sometimes including a few hours of past programs), used by the
   * grid guide and to know which past programs are catch-up-eligible. Heavier than getShortEpg, so the
   * guide only calls this for channels actually on screen, and it's cached like everything else. */
  async getFullEpg(streamId: number): Promise<EpgProgram[]> {
    const data = await this.call<{
      epg_listings?: {
        id: string
        title: string
        description: string
        start: string
        end: string
        start_timestamp?: string | number
        stop_timestamp?: string | number
        has_archive?: string | number
      }[]
    }>('get_simple_data_table', { stream_id: String(streamId) })

    return (data.epg_listings || []).map((e) => ({
      id: e.id,
      title: decodeEpgText(e.title),
      description: decodeEpgText(e.description),
      start: e.start,
      end: e.end,
      startTimestamp: e.start_timestamp != null ? Number(e.start_timestamp) : undefined,
      endTimestamp: e.stop_timestamp != null ? Number(e.stop_timestamp) : undefined,
      hasArchive: Number(e.has_archive) === 1,
    }))
  }

  /** Pede ao proxy o codigo cifrado das URLs de video. Falhar aqui nunca derruba o login: sem codigo, as
   * URLs so voltam ao formato antigo. 204 = o servidor ainda nao tem a chave (secret STREAM_KEY). */
  private async refreshStreamSession(): Promise<void> {
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ base: this.creds.baseUrl, username: this.creds.username, password: this.creds.password }),
      })
      if (res.status === 204) writeSid(this.creds, null)
      else if (res.ok) writeSid(this.creds, ((await res.json()) as { sid: string }).sid)
    } catch {
      // Offline ou proxy antigo: mantem o que ja havia.
    }
  }

  /** URL de video no proxy. `path` usa ~u/~p no lugar de usuario e senha (ex. /movie/~u/~p/1.mp4). */
  private mediaUrl(path: string): string {
    const sid = readSids()[sidKey(this.creds)]
    // O codigo guarda so a origem do painel; um endereco com subpasta segue no formato antigo.
    let sameOrigin = false
    try {
      sameOrigin = new URL(this.creds.baseUrl).origin === this.creds.baseUrl
    } catch {
      // URL invalida: formato antigo
    }
    if (sid && sameOrigin) return `/api/stream?s=${sid}&p=${encodeURIComponent(path)}`
    const direct = this.creds.baseUrl + path.replace('~u', this.creds.username).replace('~p', this.creds.password)
    return `/api/stream?url=${encodeURIComponent(direct)}`
  }

  streamUrl(kind: 'live' | 'movie' | 'series', id: number | string, ext = 'm3u8'): string {
    const folder = kind === 'live' ? 'live' : kind === 'movie' ? 'movie' : 'series'
    return this.mediaUrl(`/${folder}/~u/~p/${id}.${ext}`)
  }

  /** Catch-up/rewind playback: `startUnixSeconds` is when the program began, `durationMinutes` how long to
   * play from there. Xtream's own oddly-specific timestamp format for this endpoint ("YYYY-MM-DD:HH-MM"). */
  timeshiftUrl(streamId: number, startUnixSeconds: number, durationMinutes: number): string {
    const d = new Date(startUnixSeconds * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const start = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}:${pad(d.getHours())}-${pad(d.getMinutes())}`
    return this.mediaUrl(`/timeshift/~u/~p/${Math.ceil(durationMinutes)}/${start}/${streamId}.m3u8`)
  }

  /** Same file as streamUrl, but asks the proxy to send it as a "Save As" download instead of an inline stream. */
  downloadUrl(kind: 'movie' | 'series', id: number | string, ext: string, filename: string): string {
    const folder = kind === 'movie' ? 'movie' : 'series'
    const safeName = `${filename}.${ext}`.replace(/[/\\]/g, '_')
    return `${this.mediaUrl(`/${folder}/~u/~p/${id}.${ext}`)}&download=1&filename=${encodeURIComponent(safeName)}`
  }
}
