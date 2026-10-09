import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CatalogProgress from '../components/CatalogProgress'
import CategoryRow from '../components/CategoryRow'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import FilterBar from '../components/FilterBar'
import PosterGrid from '../components/PosterGrid'
import RatingFilter from '../components/RatingFilter'
import Row from '../components/Row'
import Select from '../components/Select'
import { useMovieCatalog } from '../hooks/useCatalog'
import type { Movie } from '../types'
import ErrorCard from '../components/ErrorCard'

type SortKey = 'default' | 'name' | 'recent' | 'rating'

function sortMovies(items: Movie[], sort: SortKey): Movie[] {
  if (sort === 'default') return items // same reference — see CategoryRow.tsx for why that matters
  const copy = [...items]
  if (sort === 'name') copy.sort((a, b) => a.name.localeCompare(b.name))
  if (sort === 'recent') copy.sort((a, b) => Number(b.added || 0) - Number(a.added || 0))
  if (sort === 'rating') copy.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
  return copy
}

// Prévia de cada categoria: 10 mil cartões de uma vez (o painel do Christian) travava o celular. O resto fica
// em "Ver tudo", que abre a categoria em grade montada por blocos.
const ROW_LIMIT = 40

export default function MoviesPage() {
  const { groups, loading, error, retry } = useMovieCatalog()
  const [searchParams] = useSearchParams()
  // Preset by the "Ver tudo" link on a Home category row — read once on mount, same as a bookmark/deep link.
  const [activeCategory, setActiveCategory] = useState<string | null>(searchParams.get('category'))
  const [minRating, setMinRating] = useState(0)
  const [sort, setSort] = useState<SortKey>('default')

  // Kept as separate (category, items, loading) tuples rather than one spread `{...g, items: sorted}`
  // object per group: with the default sort, `sortMovies` returns `g.items` completely untouched, so a
  // category whose data hasn't changed keeps the exact same `items` array reference across re-renders —
  // which is what lets CategoryRow's memoization actually skip re-rendering it.
  //
  // No genre/year filter here on purpose: Xtream only gives those on a per-title detail call, not the
  // base catalog listing, so filtering by them would mean fetching details for every movie — the same
  // provider-hammering cost the catalog's caching/pacing was built to avoid. Category already works as a
  // free genre proxy (providers commonly name categories like "Filmes - Terror").
  const visibleGroups = useMemo(() => {
    const filtered = activeCategory ? groups.filter((g) => g.category.categoryId === activeCategory) : groups
    return filtered
      .map((g) => ({
        category: g.category,
        loading: g.loading,
        items: sortMovies(
          minRating > 0 ? g.items.filter((m) => Number(m.rating) >= minRating) : g.items,
          sort,
        ),
      }))
      .filter((g) => g.items.length > 0 || g.loading)
  }, [groups, activeCategory, minRating, sort])

  return (
    <div className="min-h-screen pt-[calc(6rem+env(safe-area-inset-top))]">
      <div className="mb-6 flex flex-wrap items-center gap-3 px-4 sm:px-10">
        <h1 className="font-display text-headline-md text-white sm:text-headline-lg">Filmes</h1>
        <FilterBar active={[sort !== 'default', minRating > 0, activeCategory != null].filter(Boolean).length}>
        <Select
          label="Ordenar"
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={[
            { value: 'default', label: 'Ordem padrão' },
            { value: 'name', label: 'Nome (A-Z)' },
            { value: 'recent', label: 'Adicionados recentemente' },
            { value: 'rating', label: 'Melhor avaliados' },
          ]}
        />
        <RatingFilter value={minRating} onChange={setMinRating} />
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

      <ContinueWatchingRow kind="movie" />

      {error && <ErrorCard message={error} onRetry={retry} className="mb-8" />}
      <CatalogProgress groups={groups} label="Carregando filmes" />
      {loading && groups.length === 0 && <Row title="" loading />}

      {activeCategory ? (
        // A single category picked (category filter, or the "Ver tudo" deep link) — a grid to browse
        // the whole thing beats a horizontal-scroll row, which only made sense as a compact preview
        // sitting among a stack of other categories.
        <PosterGrid kind="movie" items={visibleGroups[0]?.items ?? []} loading={visibleGroups[0]?.loading} />
      ) : (
        visibleGroups.map(({ category, items, loading: groupLoading }) => (
          <CategoryRow
            key={category.categoryId}
            kind="movie"
            title={category.categoryName}
            loading={groupLoading && items.length === 0}
            items={items}
            limit={ROW_LIMIT}
            categoryId={category.categoryId}
          />
        ))
      )}
    </div>
  )
}
