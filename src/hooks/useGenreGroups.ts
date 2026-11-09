import { useEffect, useMemo, useState } from 'react'
import { movieGenreIndex } from '../lib/generos'
import { groupByGenre } from '../lib/genres'
import { firstPerWork, mergeVersions } from '../lib/versions'
import { STREAMINGS, streamingGroupId, streamingIndex, streamingsInName } from '../lib/streaming'
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
  const [streams, setStreams] = useState<Record<number, string[]>>({})
  useEffect(() => {
    let alive = true
    void streamingIndex(kind).then((i) => alive && setStreams(i))
    return () => {
      alive = false
    }
  }, [kind])
  return useMemo(() => {
    const useIndex = kind === 'movie' && Object.keys(index).length > 0
    const source = useIndex ? groups.map((g) => ({ ...g, items: g.items.map((m) => enrich(m, index)) })) : groups
    // Com o indice do TMDB so os populares tem genero: os demais vao para "Outros", sem exigir uma fatia minima.
    // A mesma obra em categorias diferentes (cada uma ja juntada) vira um cartao so na fileira do genero.
    const byGenre = (groupByGenre(source, useIndex ? 0 : undefined) ?? groups).map((g) => ({ ...g, items: mergeVersions(g.items) }))
    const latest = firstPerWork(groups.flatMap((g) => g.items).filter((m) => Number(m.added) > 0).sort((a, b) => Number(b.added) - Number(a.added))).slice(0, 100)
    const novidades: CategoryGroup<T>[] = latest.length
      ? [{ category: { categoryId: 'novidades', categoryName: latestTitle }, items: latest, loading: false, error: null }]
      : []
    // Streaming: o TMDB (por tmdb_id) e o nome da categoria do provedor ("|NETFLIX|") dizem onde o titulo passa.
    const byStream = new Map<string, Map<unknown, T>>()
    // `source` e nao `groups`: com o indice do TMDB so ela traz o genero, e as fileiras por genero dentro do streaming precisam dele.
    for (const g of source) {
      const fromName = streamingsInName(g.category.categoryName)
      for (const m of g.items) {
        // O TMDB manda: titulo que alguma plataforma lista vale so por ela; o nome da categoria (que o provedor mistura) so vale para o que o TMDB nao lista.
        const known = m.tmdbId ? streams[m.tmdbId] : undefined
        for (const key of new Set(known ?? fromName)) {
          if (!byStream.has(key)) byStream.set(key, new Map())
          byStream.get(key)!.set(('streamId' in m ? m.streamId : 'seriesId' in m ? m.seriesId : m) as unknown, m)
        }
      }
    }
    const streaming: CategoryGroup<T>[] = STREAMINGS.filter((s) => byStream.has(s.key)).map((s) => ({
      category: { categoryId: streamingGroupId(s.key), categoryName: s.name },
      items: firstPerWork([...byStream.get(s.key)!.values()]),
      loading: false,
      error: null,
    }))
    return [...novidades, ...streaming, ...byGenre].map((g) => stable(`${kind}:${latestTitle}`, g))
  }, [groups, index, streams, kind, latestTitle])
}
