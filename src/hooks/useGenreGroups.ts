import { useEffect, useMemo, useState } from 'react'
import { movieGenreIndex } from '../lib/generos'
import { groupByGenre } from '../lib/genres'
import type { CategoryGroup } from './useCatalog'

/** Fileiras por genero no lugar das categorias do provedor. Filmes: o genero vem do TMDB pelo tmdb_id quando a lista nao traz. */
export function useGenreGroups<T extends { genre?: string | null; tmdbId?: number | null }>(
  groups: CategoryGroup<T>[],
  kind: 'movie' | 'series',
): CategoryGroup<T>[] {
  const [index, setIndex] = useState<Record<number, string>>({})
  useEffect(() => {
    if (kind !== 'movie') return
    let alive = true
    void movieGenreIndex().then((i) => alive && setIndex(i))
    return () => {
      alive = false
    }
  }, [kind])
  return useMemo(() => {
    const filled =
      kind === 'movie' && Object.keys(index).length > 0
        ? groups.map((g) => ({
            ...g,
            items: g.items.map((m) => (m.genre || !m.tmdbId || !index[m.tmdbId] ? m : { ...m, genre: index[m.tmdbId] })),
          }))
        : groups
    // Com o indice do TMDB so os populares tem genero: os demais vao para "Outros", sem exigir uma fatia minima.
    return groupByGenre(filled, filled === groups ? undefined : 0) ?? groups
  }, [groups, index, kind])
}
