import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CatalogProgress from '../components/CatalogProgress'
import FilterPanel, { ChipGroup, FilterSection } from '../components/FilterPanel'
import CategoryRow from '../components/CategoryRow'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import PosterGrid from '../components/PosterGrid'
import RatingFilter from '../components/RatingFilter'
import Row from '../components/Row'
import Select from '../components/Select'
import { useSeriesCatalog } from '../hooks/useCatalog'
import { cleanCategoryName } from '../lib/channelGroups'
import { genresOf } from '../lib/genres'
import type { SeriesItem } from '../types'
import ErrorCard from '../components/ErrorCard'

type SortKey = 'default' | 'name' | 'rating'
const SORT_LABELS: Record<SortKey, string> = { default: 'Padrão', name: 'Nome (A-Z)', rating: 'Melhor avaliados' }

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
  for (const item of items) for (const g of genresOf(item.genre)) set.add(g)
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

// Prévia de cada categoria: 10 mil cartões de uma vez (o painel do Christian) travava o celular. O resto fica
// em "Ver tudo", que abre a categoria em grade montada por blocos.
const ROW_LIMIT = 40

export default function SeriesPage() {
  const { groups, loading, error, retry } = useSeriesCatalog()
  const [searchParams, setSearchParams] = useSearchParams()
  // A categoria mora na URL: o "Ver tudo" das fileiras desta mesma pagina so troca o ?category= (sem remontar a
  // pagina), e ler isso uma vez na montagem fazia o link nao abrir nada (Suporte, 21/10). Voltar sai da grade.
  const activeCategory = searchParams.get('category')
  const setActiveCategory = (id: string | null) => setSearchParams(id ? { category: id } : {}, { replace: true })
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
              (!activeGenre || genresOf(it.genre).includes(activeGenre)) &&
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
        <FilterPanel
          active={[
            sort !== 'default' && { key: 'sort', label: SORT_LABELS[sort], clear: () => setSort('default') },
            minRating > 0 && { key: 'rating', label: `★ ${minRating}+`, clear: () => setMinRating(0) },
            activeYear != null && { key: 'year', label: String(activeYear), clear: () => setActiveYear(null) },
            activeCategory != null && {
              key: 'category',
              label: cleanCategoryName(groups.find((g) => g.category.categoryId === activeCategory)?.category.categoryName ?? ''),
              clear: () => setActiveCategory(null),
            },
            activeGenre != null && { key: 'genre', label: activeGenre, clear: () => setActiveGenre(null) },
          ].filter((f) => f !== false)}
        >
          <ChipGroup
            title="Ordenar"
            value={sort}
            onChange={setSort}
            options={(Object.keys(SORT_LABELS) as SortKey[]).map((k) => ({ value: k, label: SORT_LABELS[k] }))}
          />
          <RatingFilter value={minRating} onChange={setMinRating} />
          {allYears.length > 0 && (
            <FilterSection title="Ano">
              <Select
                inline
                label="Ano"
                value={activeYear != null ? String(activeYear) : ''}
                onChange={(v) => setActiveYear(v ? Number(v) : null)}
                options={[{ value: '', label: 'Qualquer ano' }, ...allYears.map((y) => ({ value: String(y), label: String(y) }))]}
              />
            </FilterSection>
          )}
          <FilterSection title="Categoria">
            <Select
              inline
              label="Categoria"
              value={activeCategory ?? ''}
              onChange={(v) => setActiveCategory(v || null)}
              options={[
                { value: '', label: 'Todas as categorias' },
                ...groups.map((g) => ({ value: g.category.categoryId, label: cleanCategoryName(g.category.categoryName) })),
              ]}
            />
          </FilterSection>
          {allGenres.length > 0 && (
            <ChipGroup
              title="Gênero"
              value={activeGenre ?? ''}
              onChange={(v) => setActiveGenre(v || null)}
              options={[{ value: '', label: 'Todos' }, ...allGenres.map((g) => ({ value: g, label: g }))]}
            />
          )}
        </FilterPanel>
      </div>

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
            title={cleanCategoryName(category.categoryName)}
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
