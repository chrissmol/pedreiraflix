import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FilterBar from '../components/FilterBar'
import { Calendar } from '../components/icons'
import LiveChannelCard from '../components/LiveChannelCard'
import Select from '../components/Select'
import { useLiveCatalog } from '../hooks/useCatalog'
import { matchesQuery } from '../lib/search'
import { favoritesFor, useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'

const PAGE_SIZE = 60

export default function LivePage() {
  const { groups, loading, error } = useLiveCatalog()
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

  return (
    <div className="flex min-h-screen pt-[calc(4rem+env(safe-area-inset-top))]">
      <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-outline-soft px-2 py-4 sm:block">
        <button
          onClick={() => setActiveCategory(null)}
          className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
            activeCategory === null
              ? 'glow-border bg-gradient-to-r from-brand-500/90 to-brand-700/90 text-white'
              : 'text-zinc-400 hover:bg-white/5 hover:text-white'
          }`}
        >
          Todos os canais
        </button>
        {visibleCategories.map((g) => (
          <button
            key={g.category.categoryId}
            onClick={() => setActiveCategory(g.category.categoryId)}
            className={`mb-1 w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              activeCategory === g.category.categoryId
                ? 'glow-border bg-gradient-to-r from-brand-500/90 to-brand-700/90 text-white'
                : 'text-zinc-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            {g.category.categoryName}
          </button>
        ))}
      </aside>

      <div className="flex-1 px-4 py-4 sm:px-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-2xl font-bold text-white">Canais ao vivo</h1>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Filtrar canais..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="brand-focus w-full rounded-xl border border-outline-soft bg-surface-container px-3.5 py-2 text-sm text-white transition-colors focus:border-brand-500/60 sm:w-64"
            />
            <button
              onClick={() => navigate(`/guide${activeCategory ? `?category=${activeCategory}` : ''}`)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-outline-soft bg-surface-container px-3.5 py-2 text-sm font-medium text-white transition-colors hover:border-brand-500/40 hover:bg-surface-high"
            >
              <Calendar className="h-4 w-4" /> Guia
            </button>
            {/* Category lives in the sidebar from sm up; on a phone it joins the collapsible filters
                instead of standing alone above the list. */}
            <FilterBar active={[onlyArchive, activeCategory != null].filter(Boolean).length}>
              <button
                onClick={() => setOnlyArchive((v) => !v)}
                aria-pressed={onlyArchive}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
                  onlyArchive
                    ? 'border-brand-400/50 bg-brand-500/15 text-brand-200'
                    : 'border-outline-soft bg-surface-container text-white hover:border-brand-500/40 hover:bg-surface-high'
                }`}
              >
                Com catch-up
              </button>
              <Select
                label="Categoria"
                className="sm:hidden"
                value={activeCategory ?? ''}
                onChange={(v) => setActiveCategory(v || null)}
                options={[
                  { value: '', label: 'Todos os canais' },
                  ...visibleCategories.map((g) => ({ value: g.category.categoryId, label: g.category.categoryName })),
                ]}
              />
            </FilterBar>
          </div>
        </div>

        {favoriteChannels.length > 0 && !filter.trim() && !activeCategory && !onlyArchive && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-zinc-400">Seus canais</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-2">
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

        {error && <p className="text-rose-400">{error}</p>}

        {/* A list, not a grid of logo tiles: a live channel's useful information is what's on right now,
            which needs a line of text and a progress bar — the shape every TV app uses for a lineup. */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-2">
          {loading && groups.length === 0
            ? Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="skeleton h-[72px] rounded-xl border border-white/5 bg-surface-container" />
              ))
            : channels.map((ch) => (
                <LiveChannelCard
                  key={ch.streamId}
                  channel={ch}
                  onOpen={() => navigate(`/watch/live/${ch.streamId}?name=${encodeURIComponent(ch.name)}`)}
                />
              ))}
        </div>

        {!loading && allChannels.length === 0 && (
          <p className="mt-8 text-center text-zinc-400">Nenhum canal encontrado.</p>
        )}

        {visibleCount < allChannels.length && <div ref={sentinelRef} className="h-10" />}
      </div>
    </div>
  )
}
