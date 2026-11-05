import { useEffect, useMemo, useState } from 'react'
import { movieGenreIndex } from '../lib/generos'
import { groupByGenre } from '../lib/genres'
import { firstPerWork } from '../lib/versions'
import type { CategoryGroup } from './useCatalog'

// Mesmo item com genero => mesmo objeto, e fileira igual => mesmo grupo: sem isso toda fileira renderiza de novo a cada
// categoria que termina de carregar (e2e/perf.spec.ts). Fora do componente de proposito: sao caches, nao estado.
const enriched = new WeakMap<object, WeakMap<object, object>>()
const lastGroups = new Map<string, Map<string, CategoryGroup<never>>>()

function enrich<T extends Item>(m: T, index: Record<number, string>): T {
  if (m.genre || !m.tmdbId || !index[m.tmdbId]) return m
  const byItem = enriched.get(index) ?? enriched.set(index, new WeakMap()).get(index)!
  if (!byItem.has(m)) byItem.set(m, { ...m, genre: index[m.tmdbId] })
  return byItem.get(m) as T
}

function stable<T extends Item>(key: string, g: CategoryGroup<T>): CategoryGroup<T> {
  const cache = lastGroups.get(key) ?? lastGroups.set(key, new Map()).get(key)!
  const old = cache.get(g.category.categoryId) as CategoryGroup<T> | undefined
  if (old && old.loading === g.loading && old.items.length === g.items.length && old.items.every((x, i) => x === g.items[i])) return old
  cache.set(g.category.categoryId, g as CategoryGroup<never>)
  return g
}

type Item = { name: string; added?: string | null; genre?: string | null; tmdbId?: number | null }

/** Fileiras por genero no lugar das categorias do provedor, com "Novidades" (ultimas adicoes) no topo.
 * Filmes: o genero vem do TMDB pelo tmdb_id quando a lista nao traz. */
export function useGenreGroups<T extends Item>(
  groups: CategoryGroup<T>[],
  kind: 'movie' | 'series',
  latestTitle = 'Novidades',
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
    const useIndex = kind === 'movie' && Object.keys(index).length > 0
    const source = useIndex ? groups.map((g) => ({ ...g, items: g.items.map((m) => enrich(m, index)) })) : groups
    // Com o indice do TMDB so os populares tem genero: os demais vao para "Outros", sem exigir uma fatia minima.
    const byGenre = groupByGenre(source, useIndex ? 0 : undefined) ?? groups
    const latest = firstPerWork(groups.flatMap((g) => g.items).filter((m) => Number(m.added) > 0).sort((a, b) => Number(b.added) - Number(a.added))).slice(0, 100)
    const novidades: CategoryGroup<T>[] = latest.length
      ? [{ category: { categoryId: 'novidades', categoryName: latestTitle }, items: latest, loading: false, error: null }]
      : []
    return [...novidades, ...byGenre].map((g) => stable(`${kind}:${latestTitle}`, g))
  }, [groups, index, kind, latestTitle])
}
