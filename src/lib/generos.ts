import { cached } from './cache'
import { normalizeGenre } from './genres'

// Generos de filme do TMDB (ids fixos). A lista de filmes do provedor nao traz genero, so o tmdb_id.
const MOVIE_GENRES: Record<number, string> = {
  28: 'Ação', 12: 'Aventura', 16: 'Animação', 35: 'Comédia', 80: 'Crime', 99: 'Documentário', 18: 'Drama', 10751: 'Família',
  14: 'Fantasia', 36: 'História', 27: 'Terror', 10402: 'Música', 9648: 'Mistério', 10749: 'Romance', 878: 'Ficção Científica',
  53: 'Suspense', 10752: 'Guerra', 37: 'Faroeste',
}

/** tmdb_id -> "Ação / Aventura", para os filmes populares de cada genero (/api/generos). Vazio sem token ou com erro. */
export function movieGenreIndex(): Promise<Record<number, string>> {
  return cached('generos:movie', async () => {
    const index: Record<number, string[]> = {}
    const ids = Object.keys(MOVIE_GENRES).map(Number)
    let next = 0
    // 4 por vez: sao 18 pedidos e o Worker limita o ritmo por IP.
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < ids.length) {
          const id = ids[next++]
          const res = await fetch(`/api/generos?genre=${id}`).catch(() => null)
          if (res?.status !== 200) continue
          for (const tmdbId of ((await res.json()) as { ids: number[] }).ids) (index[tmdbId] ??= []).push(normalizeGenre(MOVIE_GENRES[id]))
        }
      }),
    )
    if (Object.keys(index).length === 0) throw new Error('sem generos')
    return Object.fromEntries(Object.entries(index).map(([k, v]) => [k, v.join(' / ')])) as Record<number, string>
  }).catch(() => ({}))
}
