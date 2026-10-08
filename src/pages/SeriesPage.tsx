import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CatalogProgress from '../components/CatalogProgress'
import FilterBar from '../components/FilterBar'
import CategoryRow from '../components/CategoryRow'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import PosterGrid from '../components/PosterGrid'
import RatingFilter from '../components/RatingFilter'
import Row from '../components/Row'
import Select from '../components/Select'
import { useSeriesCatalog } from '../hooks/useCatalog'
import type { SeriesItem } from '../types'
import ErrorCard from '../components/ErrorCard'

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

function yearOf(item: SeriesItem): number | null {
  const y = item.releaseDate ? Number(item.releaseDate.slice(0, 4)) : NaN
  return Number.isFinite(y) && y > 1900 ? y : null
}

// Also free — releaseDate is on the base get_series listing already (see extractGenres above for why
// that matters: it's the opposite of movies, where this would cost a detail call per title).
function extractYears(items: SeriesItem[]): number[] {
  const set = new Set<number>()
  for (const item of items) {
    const y = yearOf(item)
    if (y) set.add(y)
  }
  return [...set].sort((a, b) => b - a)
}

export default function SeriesPage() {
  const { groups, loading, error, retry } = useSeriesCatalog()
  const [searchParams] = useSearchParams()
  // Preset by the "Ver tudo" link on a Home category row — read once on mount, same as a bookmark/deep link.
  const [activeCategory, setActiveCategory] = useState<string | null>(searchParams.get('category'))
  const [activeGenre, setActiveGenre] = useState<string | null>(null)
  const [activeYear, setActiveYear] = useState<number | null>(null)
  const [minRating, setMinRating] = useState(0)
  const [sort, setSort] = useState<SortKey>('default')

  const allGenres = useMemo(() => extractGenres(groups.flatMap((g) => g.items)), [groups])
  const allYears = useMemo(() => extractYears(groups.flatMap((g) => g.items)), [groups])

  const visibleGroups = useMemo(() => {
    const filtered = activeCategory ? groups.filter((g) => g.category.categoryId === activeCategory) : groups
    return filtered
      .map((g) => ({
        category: g.category,
        loading: g.loading,
        items: sortSeries(
          g.items.filter(
            (it) =>
              (!activeGenre || it.genre?.split(/[,/]/).some((g2) => g2.trim() === activeGenre)) &&
              (!activeYear || yearOf(it) === activeYear) &&
              (minRating === 0 || Number(it.rating) >= minRating),
          ),
          sort,
        ),
      }))
      .filter((g) => g.items.length > 0 || g.loading)
  }, [groups, activeCategory, activeGenre, activeYear, minRating, sort])

  return (
    <div className="min-h-screen pt-[calc(6rem+env(safe-area-inset-top))]">
      <div className="mb-6 flex flex-wrap items-center gap-3 px-4 sm:px-10">
        <h1 className="font-display text-headline-md text-white sm:text-headline-lg">Séries</h1>
        <FilterBar
          active={[sort !== 'default', minRating > 0, activeYear != null, activeCategory != null].filter(Boolean).length}
        >
        <Select
          label="Ordenar"
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={[
            { value: 'default', label: 'Ordem padrão' },
            { value: 'name', label: 'Nome (A-Z)' },
            { value: 'rating', label: 'Melhor avaliados' },
          ]}
        />
        <RatingFilter value={minRating} onChange={setMinRating} />
        {allYears.length > 0 && (
          <Select
            label="Ano"
            value={activeYear != null ? String(activeYear) : ''}
            onChange={(v) => setActiveYear(v ? Number(v) : null)}
            options={[{ value: '', label: 'Qualquer ano' }, ...allYears.map((y) => ({ value: String(y), label: String(y) }))]}
          />
        )}
        <Select
          label="Categoria"
          className="ml-auto max-w-56"
          value={activeCategory ?? ''}
          onChange={(v) => setActiveCategory(v || null)}
          options={[
            { value: '', label: 'Todas as categorias' },
            ...groups.map((g) => ({ value: g.category.categoryId, label: g.category.categoryName })),
          ]}
        />
        </FilterBar>
      </div>

      {allGenres.length > 0 && (
        <div className="no-scrollbar mb-6 flex gap-2 overflow-x-auto px-4 sm:flex-wrap sm:px-10">
          <button
            onClick={() => setActiveGenre(null)}
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-label-md transition-colors ${
              activeGenre === null
                ? 'bg-brand-500 text-white shadow-[0_0_20px_-4px_rgba(15,123,255,0.6)]'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-high hover:text-white'
            }`}
          >
            Todos os gêneros
          </button>
          {allGenres.map((g) => (
            <button
              key={g}
              onClick={() => setActiveGenre(g === activeGenre ? null : g)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-label-md transition-colors ${
              activeGenre === g
                ? 'bg-brand-500 text-white shadow-[0_0_20px_-4px_rgba(15,123,255,0.6)]'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-high hover:text-white'
            }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      <ContinueWatchingRow kind="series" />

      {error && <ErrorCard message={error} onRetry={retry} className="mb-8" />}
      <CatalogProgress groups={groups} label="Carregando séries" />
      {loading && groups.length === 0 && <Row title="" loading />}

      {activeCategory ? (
        <PosterGrid kind="series" items={visibleGroups[0]?.items ?? []} loading={visibleGroups[0]?.loading} />
      ) : (
        visibleGroups.map(({ category, items, loading: groupLoading }) => (
          <CategoryRow
            key={category.categoryId}
            kind="series"
            title={category.categoryName}
            loading={groupLoading && items.length === 0}
            items={items}
          />
        ))
      )}
    </div>
  )
}
