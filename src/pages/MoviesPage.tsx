import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CatalogProgress from '../components/CatalogProgress'
import ContinueWatchingRow from '../components/ContinueWatchingRow'
import PosterCard from '../components/PosterCard'
import Row from '../components/Row'
import { useMovieCatalog } from '../hooks/useCatalog'
import type { Movie } from '../types'

type SortKey = 'default' | 'name' | 'recent' | 'rating'

function sortMovies(items: Movie[], sort: SortKey): Movie[] {
  if (sort === 'default') return items
  const copy = [...items]
  if (sort === 'name') copy.sort((a, b) => a.name.localeCompare(b.name))
  if (sort === 'recent') copy.sort((a, b) => Number(b.added || 0) - Number(a.added || 0))
  if (sort === 'rating') copy.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
  return copy
}

export default function MoviesPage() {
  const { groups, loading, error } = useMovieCatalog()
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('default')
  const navigate = useNavigate()

  const visibleGroups = useMemo(() => {
    const filtered = activeCategory ? groups.filter((g) => g.category.categoryId === activeCategory) : groups
    return filtered
      .filter((g) => g.items.length > 0 || g.loading)
      .map((g) => ({ ...g, items: sortMovies(g.items, sort) }))
  }, [groups, activeCategory, sort])

  return (
    <div className="min-h-screen pt-24">
      <div className="mb-6 flex flex-wrap items-center gap-3 px-4 sm:px-10">
        <h1 className="font-display text-2xl font-bold text-white">Filmes</h1>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="brand-focus rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2 text-sm text-white"
        >
          <option value="default">Ordem padrão</option>
          <option value="name">Nome (A-Z)</option>
          <option value="recent">Adicionados recentemente</option>
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

      <ContinueWatchingRow kind="movie" />

      {error && <p className="px-4 text-rose-400 sm:px-10">{error}</p>}
      <CatalogProgress groups={groups} label="Carregando filmes" />
      {loading && groups.length === 0 && <Row title="Carregando..." loading />}

      {visibleGroups.map(({ category, items, loading: groupLoading }) => (
        <Row key={category.categoryId} title={category.categoryName} loading={groupLoading && items.length === 0}>
          {items.map((m) => (
            <PosterCard
              key={m.streamId}
              title={m.name}
              image={m.streamIcon}
              badge={m.rating && Number(m.rating) > 0 ? `★ ${Number(m.rating).toFixed(1)}` : null}
              onClick={() => navigate(`/movies/${m.streamId}`)}
            />
          ))}
        </Row>
      ))}
    </div>
  )
}
