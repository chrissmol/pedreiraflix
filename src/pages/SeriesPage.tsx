import { useMemo, useState } from 'react'
import CatalogProgress from '../components/CatalogProgress'
import CategoryRow from '../components/CategoryRow'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import Row from '../components/Row'
import { useSeriesCatalog } from '../hooks/useCatalog'
import type { SeriesItem } from '../types'

type SortKey = 'default' | 'name' | 'rating'

function sortSeries(items: SeriesItem[], sort: SortKey): SeriesItem[] {
  if (sort === 'default') return items // same reference — see CategoryRow.tsx for why that matters
  const copy = [...items]
  if (sort === 'name') copy.sort((a, b) => a.name.localeCompare(b.name))
  if (sort === 'rating') copy.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
  return copy
}

// Xtream's get_series returns `genre` directly on the base listing (unlike movies, whose genre only
// comes from a per-title detail call), so a genre chip filter is cheap here — no extra requests, just a
// second cut over data already loaded. Split on the same separators providers use ("Ação, Drama" /
// "Ação / Drama") since it's a free-text field, not a fixed enum.
function extractGenres(items: SeriesItem[]): string[] {
  const set = new Set<string>()
  for (const item of items) {
    if (!item.genre) continue
    for (const g of item.genre.split(/[,/]/)) {
      const trimmed = g.trim()
      if (trimmed) set.add(trimmed)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export default function SeriesPage() {
  const { groups, loading, error } = useSeriesCatalog()
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activeGenre, setActiveGenre] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('default')

  const allGenres = useMemo(() => extractGenres(groups.flatMap((g) => g.items)), [groups])

  const visibleGroups = useMemo(() => {
    const filtered = activeCategory ? groups.filter((g) => g.category.categoryId === activeCategory) : groups
    return filtered
      .map((g) => ({
        category: g.category,
        loading: g.loading,
        items: sortSeries(
          activeGenre ? g.items.filter((it) => it.genre?.split(/[,/]/).some((g2) => g2.trim() === activeGenre)) : g.items,
          sort,
        ),
      }))
      .filter((g) => g.items.length > 0 || g.loading)
  }, [groups, activeCategory, activeGenre, sort])

  return (
    <div className="min-h-screen pt-24">
      <div className="mb-6 flex flex-wrap items-center gap-3 px-4 sm:px-10">
        <h1 className="font-display text-2xl font-bold text-white">Séries</h1>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="brand-focus rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2 text-sm text-white"
        >
          <option value="default">Ordem padrão</option>
          <option value="name">Nome (A-Z)</option>
          <option value="rating">Melhor avaliados</option>
        </select>
        <select
          value={activeCategory ?? ''}
          onChange={(e) => setActiveCategory(e.target.value || null)}
          className="brand-focus ml-auto rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2 text-sm text-white"
        >
          <option value="">Todas as categorias</option>
          {groups.map((g) => (
            <option key={g.category.categoryId} value={g.category.categoryId}>
              {g.category.categoryName}
            </option>
          ))}
        </select>
      </div>

      {allGenres.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2 px-4 sm:px-10">
          <button
            onClick={() => setActiveGenre(null)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activeGenre === null
                ? 'border-brand-400/60 bg-brand-500/20 text-brand-200'
                : 'border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-brand-500/40 hover:text-white'
            }`}
          >
            Todos os gêneros
          </button>
          {allGenres.map((g) => (
            <button
              key={g}
              onClick={() => setActiveGenre(g === activeGenre ? null : g)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                activeGenre === g
                  ? 'border-brand-400/60 bg-brand-500/20 text-brand-200'
                  : 'border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-brand-500/40 hover:text-white'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      <ContinueWatchingRow kind="series" />

      {error && <p className="px-4 text-rose-400 sm:px-10">{error}</p>}
      <CatalogProgress groups={groups} label="Carregando séries" />
      {loading && groups.length === 0 && <Row title="Carregando..." loading />}

      {visibleGroups.map(({ category, items, loading: groupLoading }) => (
        <CategoryRow
          key={category.categoryId}
          kind="series"
          title={category.categoryName}
          loading={groupLoading && items.length === 0}
          items={items}
        />
      ))}
    </div>
  )
}
