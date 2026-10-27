import { useCallback, useEffect, useRef, useState } from 'react'
import { cached } from '../lib/cache'
import { arrangeCategories } from '../lib/categoryPrefs'
import { isAdultCategoryName } from '../lib/parentalControl'
import { mergeVersions } from '../lib/versions'
import type { ProviderClient } from '../lib/provider'
import { NOT_AVAILABLE, XtreamApiError } from '../lib/xtream'
import { useActiveProfile } from '../store/profiles'
import type { Category, LiveChannel, Movie, SeriesItem } from '../types'
import { useXtream } from './useXtream'

export interface CategoryGroup<T> {
  category: Category
  items: T[]
  loading: boolean
  error: string | null
}

interface CategorizedCatalogState<T> {
  categories: Category[]
  groups: CategoryGroup<T>[]
  loading: boolean
  error: string | null
}

export type CatalogState<T> = CategorizedCatalogState<T> & { retry: () => void }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Pacing itself now happens in xtreamQueue (shared app-wide, with its own concurrency cap and gap), so
// this only needs to keep enough tasks in flight to feed that queue — no per-worker stagger needed on
// top of it, that would just be a second throttle stacked on the first.
async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number, staggerMs = 0): Promise<void> {
  let cursor = 0
  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++
      await tasks[index]()
      if (cursor < tasks.length) await sleep(staggerMs)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
}

/** Turns a raw fetch/Xtream error ("Xtream request failed: 502", a TypeError from a dropped connection,
 * ...) into something a non-technical user can act on, instead of showing HTTP jargon on screen. Falls
 * back to a generic message rather than the raw one — the raw message is still in the console/error
 * object for debugging, it's just not what gets rendered. */
export function friendlyCatalogError(err: unknown): string {
  if (err instanceof XtreamApiError) {
    if (err.kind === 'html') return 'O provedor respondeu uma página em vez dos canais (bloqueio ou provedor fora do ar). Tente de novo em instantes.'
    if (err.message === NOT_AVAILABLE) return NOT_AVAILABLE
    if (err.status === 429) return 'O provedor está recebendo muitos pedidos agora. Espere alguns segundos e tente de novo.'
    if (err.status && err.status >= 500) return 'O provedor está instável no momento. Tente de novo em instantes.'
    if (err.status === 401 || err.status === 403) return 'Sessão expirada ou sem permissão. Tente entrar de novo.'
  }
  return 'Não foi possível carregar. Confira sua internet e tente de novo.'
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (retries <= 0) throw err
    // Back off longer on a 429 (rate limited) than on a generic failure,
    // since retrying immediately just gets rate limited again.
    const isRateLimited = err instanceof XtreamApiError && err.status === 429
    await sleep(isRateLimited ? 2500 : 700)
    return withRetry(fn, retries - 1)
  }
}

// Some Xtream panels return every item across every category in one giant
// unfiltered call, which for large catalogs can take 30s+ or time out
// entirely. Fetching per category is fast and lets rows render progressively
// instead of the whole page blocking on one huge request.
//
// `client` is a required effect dependency, not just a closure value: it
// starts out null on a fresh page load until the persisted session finishes
// rehydrating from localStorage, and if the effect doesn't re-run once it
// becomes available, the catalog gets stuck on "loading" forever.
function useCategorizedCatalog<T>(
  kind: string,
  client: ProviderClient | null,
  loadCategories: (client: ProviderClient) => Promise<Category[]>,
  loadItemsForCategory: (client: ProviderClient, categoryId: string) => Promise<T[]>,
  hideAdultCategories: boolean,
  hiddenCategories: string[] | undefined,
  categoryOrder: string[] | undefined,
): CatalogState<T> {
  const [state, setState] = useState<CategorizedCatalogState<T>>({
    categories: [],
    groups: [],
    loading: true,
    error: null,
  })
  const requestId = useRef(0)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    if (!client) return

    let cancelled = false
    const myRequest = ++requestId.current
    // oxlint-disable-next-line react/set-state-in-effect -- this effect starts a new provider/catalog request.
    setState({ categories: [], groups: [], loading: true, error: null })

    cached(`${kind}:categories`, () => withRetry(() => loadCategories(client)))
      .then((allCategories) => {
        if (cancelled || myRequest !== requestId.current) return
        // Applied on every read (not cached), so toggling "Perfil infantil" takes effect immediately
        // without needing to refetch — the raw category list itself is never filtered in the cache.
        const allowed = hideAdultCategories ? allCategories.filter((c) => !isAdultCategoryName(c.categoryName)) : allCategories
        const categories = arrangeCategories(kind, allowed, hiddenCategories, categoryOrder)
        const groups: CategoryGroup<T>[] = categories.map((category) => ({
          category,
          items: [],
          loading: true,
          error: null,
        }))
        setState({ categories, groups, loading: false, error: null })

        const tasks = categories.map((category) => async () => {
          try {
            const raw = await cached(`${kind}:items:${category.categoryId}`, () =>
              withRetry(() => loadItemsForCategory(client, category.categoryId)),
            )
            // Canal com o mesmo nome pode ser um reserva: so filmes e series juntam versoes.
            const items = kind === 'live' ? raw : (mergeVersions(raw as Movie[]) as T[])
            if (cancelled || myRequest !== requestId.current) return
            setState((s) => ({
              ...s,
              groups: s.groups.map((g) =>
                g.category.categoryId === category.categoryId ? { ...g, items, loading: false } : g,
              ),
            }))
          } catch (err) {
            if (cancelled || myRequest !== requestId.current) return
            const message = friendlyCatalogError(err)
            setState((s) => ({
              ...s,
              groups: s.groups.map((g) =>
                g.category.categoryId === category.categoryId ? { ...g, loading: false, error: message } : g,
              ),
            }))
          }
        })

        // Just needs to be >= xtreamQueue's own concurrency so that queue is never left starved waiting
        // for this pool to hand it more work — the queue is what actually paces requests now.
        runWithConcurrency(tasks, 8).then(() => {
          if (cancelled || myRequest !== requestId.current) return
          // Todas as categorias falharam: sem isto a tela ficava vazia, sem dizer nada (erro por categoria e silencioso
          // de proposito, mas todas juntas e um erro de verdade).
          setState((s) =>
            s.groups.length > 0 && s.groups.every((g) => g.error && g.items.length === 0)
              ? { ...s, error: s.groups[0].error }
              : s,
          )
        })
      })
      .catch((err) => {
        if (cancelled || myRequest !== requestId.current) return
        setState({
          categories: [],
          groups: [],
          loading: false,
          error: friendlyCatalogError(err),
        })
      })

    return () => {
      cancelled = true
    }
  }, [kind, client, loadCategories, loadItemsForCategory, hideAdultCategories, hiddenCategories, categoryOrder, attempt])

  return { ...state, retry }
}

export function useLiveCatalog() {
  const client = useXtream()
  const profile = useActiveProfile()
  const hideAdult = Boolean(profile?.isKids)
  const loadCategories = useCallback((c: ProviderClient) => c.getLiveCategories(), [])
  const loadItems = useCallback((c: ProviderClient, categoryId: string) => c.getLiveStreams(categoryId), [])
  return useCategorizedCatalog<LiveChannel>('live', client, loadCategories, loadItems, hideAdult, profile?.hiddenCategories, profile?.categoryOrder)
}

export function useMovieCatalog() {
  const client = useXtream()
  const profile = useActiveProfile()
  const hideAdult = Boolean(profile?.isKids)
  const loadCategories = useCallback((c: ProviderClient) => c.getVodCategories(), [])
  const loadItems = useCallback((c: ProviderClient, categoryId: string) => c.getVodStreams(categoryId), [])
  return useCategorizedCatalog<Movie>('movie', client, loadCategories, loadItems, hideAdult, profile?.hiddenCategories, profile?.categoryOrder)
}

export function useSeriesCatalog() {
  const client = useXtream()
  const profile = useActiveProfile()
  const hideAdult = Boolean(profile?.isKids)
  const loadCategories = useCallback((c: ProviderClient) => c.getSeriesCategories(), [])
  const loadItems = useCallback((c: ProviderClient, categoryId: string) => c.getSeries(categoryId), [])
  return useCategorizedCatalog<SeriesItem>('series', client, loadCategories, loadItems, hideAdult, profile?.hiddenCategories, profile?.categoryOrder)
}

/** Flattens every loaded item across all category groups, deduped by id. Useful for search/home rails. Inclui as
 * versoes juntadas (mergeVersions): quem procura por id (favoritos, progresso) acha qualquer uma delas. */
export function flattenGroups<T extends { streamId?: number; seriesId?: number; versions?: T[] }>(groups: CategoryGroup<T>[]): T[] {
  const seen = new Set<number>()
  const out: T[] = []
  for (const group of groups) {
    for (const item of group.items.flatMap((i) => i.versions ?? [i])) {
      const id = item.streamId ?? item.seriesId ?? -1
      if (seen.has(id)) continue
      seen.add(id)
      out.push(item)
    }
  }
  return out
}
