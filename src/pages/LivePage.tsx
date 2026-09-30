import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar } from '../components/icons'
import Select from '../components/Select'
import { useLiveCatalog } from '../hooks/useCatalog'
import { matchesQuery } from '../lib/search'

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

  const filterKey = `${activeCategory ?? ''}|${filter}|${onlyArchive}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setVisibleCount(PAGE_SIZE)
  }

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
      <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-white/[0.06] px-2 py-4 sm:block">
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
              className="brand-focus w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2 text-sm text-white transition-colors focus:border-brand-500/60 sm:w-64"
            />
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs font-medium text-zinc-300">
              <input
                type="checkbox"
                checked={onlyArchive}
                onChange={(e) => setOnlyArchive(e.target.checked)}
                className="h-3.5 w-3.5 accent-brand-500"
              />
              Com catch-up
            </label>
            <button
              onClick={() => navigate(`/guide${activeCategory ? `?category=${activeCategory}` : ''}`)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:border-brand-500/40 hover:bg-zinc-800"
            >
              <Calendar className="h-4 w-4" /> Guia
            </button>
          </div>
        </div>

        <Select
          label="Categoria"
          className="mb-4 sm:hidden"
          value={activeCategory ?? ''}
          onChange={(v) => setActiveCategory(v || null)}
          options={[
            { value: '', label: 'Todos os canais' },
            ...visibleCategories.map((g) => ({ value: g.category.categoryId, label: g.category.categoryName })),
          ]}
        />

        {error && <p className="text-rose-400">{error}</p>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
          {loading && groups.length === 0
            ? Array.from({ length: 30 }).map((_, i) => (
                <div key={i} className="skeleton h-24 rounded-xl border border-white/5 bg-zinc-900" />
              ))
            : channels.map((ch) => (
                <button
                  key={ch.streamId}
                  onClick={() => navigate(`/watch/live/${ch.streamId}?name=${encodeURIComponent(ch.name)}`)}
                  className="flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-zinc-900/80 p-2 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-zinc-800 hover:shadow-[0_12px_28px_-10px_rgba(0,0,0,0.6)]"
                >
                  {ch.streamIcon ? (
                    <img
                      src={ch.streamIcon}
                      alt={ch.name}
                      loading="lazy"
                      className="h-10 max-w-full object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : null}
                  <span className="line-clamp-1 text-xs text-zinc-300">{ch.name}</span>
                </button>
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
