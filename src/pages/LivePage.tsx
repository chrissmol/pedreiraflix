import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FilterBar from '../components/FilterBar'
import { Calendar, Search } from '../components/icons'
import LiveChannelCard from '../components/LiveChannelCard'
import { useLiveCatalog } from '../hooks/useCatalog'
import { matchesQuery } from '../lib/search'
import { favoritesFor, useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'
import ErrorCard from '../components/ErrorCard'

const PAGE_SIZE = 60

export default function LivePage() {
  const { groups, loading, error, retry } = useLiveCatalog()
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  // Live channels have none of movies/series' catalog metadata (no genre/year/rating from the provider)
  // — catch-up/archive availability is the one thing on the base listing worth filtering by here.
  const [onlyArchive, setOnlyArchive] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const visibleCategories = useMemo(() => groups.filter((g) => g.items.length > 0), [groups])

  // Zapping is a handful of channels, not the whole lineup — favourites come first so getting to them
  // never means scrolling (or remembering which category they're filed under).
  const profileId = useActiveProfileId()
  const favoritesRecord = useLibraryStore((s) => s.favorites)
  const favoriteChannels = useMemo(() => {
    const ids = new Set(favoritesFor(favoritesRecord, profileId).filter((f) => f.kind === 'live').map((f) => f.id))
    if (ids.size === 0) return []
    return groups.flatMap((g) => g.items).filter((c) => ids.has(c.streamId))
  }, [favoritesRecord, profileId, groups])

  const allChannels = useMemo(() => {
    const scopedGroups = activeCategory
      ? visibleCategories.filter((g) => g.category.categoryId === activeCategory)
      : visibleCategories

    let flat: typeof scopedGroups[number]['items']
    if (!filter.trim()) {
      flat = scopedGroups.flatMap((g) => g.items)
    } else {
      // Matching the category name too means typing a genre like "futebol"
      // finds every channel in that category, even ones whose own name
      // doesn't contain the word.
      flat = scopedGroups.flatMap((g) => {
        const categoryMatches = matchesQuery(g.category.categoryName, filter)
        return g.items.filter((c) => categoryMatches || matchesQuery(c.name, filter))
      })
    }
    return onlyArchive ? flat.filter((c) => c.hasArchive) : flat
  }, [visibleCategories, activeCategory, filter, onlyArchive])

  const channels = allChannels.slice(0, visibleCount)

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- filter/category changes must restart infinite scroll.
    setVisibleCount(PAGE_SIZE)
  }, [activeCategory, filter, onlyArchive])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((v) => Math.min(v + PAGE_SIZE, allChannels.length))
        }
      },
      { rootMargin: '400px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [allChannels.length])

  const totalChannels = visibleCategories.reduce((n, g) => n + g.items.length, 0)
  const pill = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-label-md transition-colors ${
      active
        ? 'bg-brand-500 text-white shadow-[0_0_20px_-4px_rgba(15,123,255,0.6)]'
        : 'bg-surface-container text-on-surface-variant hover:bg-surface-high hover:text-white'
    }`

  return (
    <div className="min-h-screen px-4 pb-10 pt-[calc(5rem+env(safe-area-inset-top))] sm:px-10 sm:pt-24">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <h1 className="font-display text-headline-md text-white sm:text-headline-lg">Canais ao vivo</h1>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-muted" />
            <input
              type="search"
              placeholder="Filtrar canais..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="brand-focus h-11 w-full rounded-full border border-outline-soft bg-surface-container pl-10 pr-4 text-body-md text-white placeholder-on-surface-muted transition-colors focus:border-brand-500/60"
            />
          </div>
          <button
            onClick={() => navigate(`/guide${activeCategory ? `?category=${activeCategory}` : ''}`)}
            className="btn-secondary h-11"
          >
            <Calendar className="h-4 w-4" /> Guia
          </button>
          <FilterBar active={onlyArchive ? 1 : 0}>
            <button onClick={() => setOnlyArchive((v) => !v)} aria-pressed={onlyArchive} className={`btn-secondary h-11 ${onlyArchive ? 'player-btn-active' : ''}`}>
              Com catch-up
            </button>
          </FilterBar>
        </div>
      </div>

      {/* Categorias em pilula com a contagem, como no Stitch — no lugar da barra lateral, e iguais no
          celular (antes la elas viravam um select escondido em "Filtrar"). */}
      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <button onClick={() => setActiveCategory(null)} aria-pressed={activeCategory === null} className={pill(activeCategory === null)}>
          Todos os canais <span className="opacity-70">({totalChannels})</span>
        </button>
        {visibleCategories.map((g) => (
          <button
            key={g.category.categoryId}
            onClick={() => setActiveCategory(g.category.categoryId)}
            aria-pressed={activeCategory === g.category.categoryId}
            className={pill(activeCategory === g.category.categoryId)}
          >
            {g.category.categoryName} <span className="opacity-70">({g.items.length})</span>
          </button>
        ))}
      </div>

      {favoriteChannels.length > 0 && !filter.trim() && !activeCategory && !onlyArchive && (
        <section className="mb-8">
          <h2 className="font-display mb-3 flex items-center gap-2 text-headline-sm text-white">
            <span className="h-4 w-1 rounded-full bg-brand-500" />
            Seus canais
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-3">
            {favoriteChannels.map((ch) => (
              <LiveChannelCard
                key={`fav-${ch.streamId}`}
                channel={ch}
                onOpen={() => navigate(`/watch/live/${ch.streamId}?name=${encodeURIComponent(ch.name)}`)}
              />
            ))}
          </div>
        </section>
      )}

      {error && <ErrorCard message={error} onRetry={retry} className="!mx-0 mb-8" />}

      {/* A list, not a grid of logo tiles: a live channel's useful information is what's on right now,
          which needs a line of text and a progress bar — the shape every TV app uses for a lineup. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-3">
        {loading && groups.length === 0
          ? Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton h-[88px] rounded-2xl bg-surface-container" />)
          : channels.map((ch) => (
              <LiveChannelCard
                key={ch.streamId}
                channel={ch}
                onOpen={() => navigate(`/watch/live/${ch.streamId}?name=${encodeURIComponent(ch.name)}`)}
              />
            ))}
      </div>

      {!loading && allChannels.length === 0 && <p className="mt-8 text-center text-on-surface-variant">Nenhum canal encontrado.</p>}

      {visibleCount < allChannels.length && <div ref={sentinelRef} className="h-10" />}
    </div>
  )
}
