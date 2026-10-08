import { cached } from './cache'

export interface TmdbInfo {
  genres: string[]
  year: string | null
  rating: number | null
  overview: string | null
  /** IMDb's rating ("7.8"), via OMDb in the Worker; absent/null when OMDB_KEY isn't set or there's no match. */
  imdbRating?: string | null
}

// "Filme (2023)" / "[L] Filme" -> "Filme": providers decorate titles, TMDB's search wants the bare name.
const cleanTitle = (name: string) => name.replace(/\[[^\]]*\]|\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()

/** Fills gaps Xtream leaves in movie details (genre/year/rating/plot) via the Worker's optional /api/tmdb.
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
