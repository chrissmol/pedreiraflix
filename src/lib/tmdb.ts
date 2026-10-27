import { cached } from './cache'

export interface TmdbInfo {
  genres: string[]
  year: string | null
  overview: string | null
  /** IMDb's rating ("7.8"), via OMDb in the Worker; absent/null when OMDB_KEY isn't set or there's no match. */
  imdbRating?: string | null
  /** Series only: cast and episode thumbnails ("1x1" -> url) from TVmaze, to fill what the provider leaves out. */
  tvmaze?: { cast: string | null; episodeImages: Record<string, string> } | null
  /** Logo do titulo (PNG transparente), em portugues quando existe. */
  logo?: string | null
  /** Classificacao indicativa do Brasil: L, 10, 12, 14, 16 ou 18. */
  certification?: string | null
}

/** Perfil infantil ve ate 12 anos; 14, 16 e 18 ficam bloqueados (alem das categorias adultas). */
export const blockedForKids = (certification: string | null | undefined) => ['14', '16', '18'].includes(certification ?? '')

// "Filme (2023)" / "[L] Filme" -> "Filme": providers decorate titles, TMDB's search wants the bare name.
const cleanTitle = (name: string) => name.replace(/\[[^\]]*\]|\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()

/** Fills gaps Xtream leaves in movie details (genre/year/plot) via the Worker's optional /api/tmdb.
 * Resolves null when TMDB isn't configured or has no match; nulls aren't cached, so adding the secret later
 * takes effect immediately. */
export function getTmdbInfo(name: string, releaseDate: string | null, kind: 'movie' | 'tv' = 'movie'): Promise<TmdbInfo | null> {
  const title = cleanTitle(name)
  if (!title) return Promise.resolve(null)
  const year = releaseDate?.slice(0, 4) ?? ''
  const params = new URLSearchParams({ title, ...(/^\d{4}$/.test(year) ? { year } : {}), ...(kind === 'tv' ? { kind } : {}) })
  return cached(`tmdb:${params}`, async () => {
    const res = await fetch(`/api/tmdb?${params}`)
    if (res.status !== 200) throw new Error('no tmdb data')
    return (await res.json()) as TmdbInfo
  }).catch(() => null)
}

const titleParams = (name: string, releaseDate: string | null) => {
  const year = releaseDate?.slice(0, 4) ?? ''
  return { title: cleanTitle(name), ...(/^\d{4}$/.test(year) ? { year } : {}) }
}

/** Sinopse traduzida pela IA quando nem o provedor nem o TMDB tem uma em portugues. Sem IA ou erro: null. */
export function getAiSynopsis(name: string, releaseDate: string | null, kind: 'movie' | 'tv'): Promise<string | null> {
  const params = new URLSearchParams({ ...titleParams(name, releaseDate), ...(kind === 'tv' ? { kind } : {}) })
  if (!params.get('title')) return Promise.resolve(null)
  return cached(`sinopse:${params}`, async () => {
    const res = await fetch(`/api/sinopse?${params}`)
    if (res.status !== 200) throw new Error('sem sinopse')
    return ((await res.json()) as { overview: string }).overview
  }).catch(() => null)
}

/** "Resumo ate aqui": o que aconteceu nos episodios antes deste, pela IA. Sem IA, sem sinopses ou erro: null. */
export function getRecap(name: string, releaseDate: string | null, season: number, episode: number): Promise<string | null> {
  const params = new URLSearchParams({ ...titleParams(name, releaseDate), season: String(season), episode: String(episode) })
  if (!params.get('title')) return Promise.resolve(null)
  return cached(`resumo:${params}`, async () => {
    const res = await fetch(`/api/resumo?${params}`)
    if (res.status !== 200) throw new Error('sem resumo')
    return ((await res.json()) as { summary: string }).summary
  }).catch(() => null)
}
