import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveCatalog } from '../hooks/useCatalog'
import { matchesQuery } from '../lib/search'

const PAGE_SIZE = 60

export default function LivePage() {
  const { groups, loading, error } = useLiveCatalog()
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const visibleCategories = useMemo(() => groups.filter((g) => g.items.length > 0), [groups])

  const allChannels = useMemo(() => {
    const scopedGroups = activeCategory
      ? visibleCategories.filter((g) => g.category.categoryId === activeCategory)
      : visibleCategories

    if (!filter.trim()) return scopedGroups.flatMap((g) => g.items)

    // Matching the category name too means typing a genre like "futebol"
    // finds every channel in that category, even ones whose own name
    // doesn't contain the word.
    return scopedGroups.flatMap((g) => {
      const categoryMatches = matchesQuery(g.category.categoryName, filter)
      return g.items.filter((c) => categoryMatches || matchesQuery(c.name, filter))
    })
  }, [visibleCategories, activeCategory, filter])

  const channels = allChannels.slice(0, visibleCount)

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [activeCategory, filter])

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
    <div className="flex min-h-screen pt-16">
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
          <input
            type="search"
            placeholder="Filtrar canais..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="brand-focus w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2 text-sm text-white transition-colors focus:border-brand-500/60 sm:w-64"
          />
        </div>

        <select
          value={activeCategory ?? ''}
          onChange={(e) => setActiveCategory(e.target.value || null)}
          className="brand-focus mb-4 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2 text-sm text-white sm:hidden"
        >
          <option value="">Todos os canais</option>
          {visibleCategories.map((g) => (
            <option key={g.category.categoryId} value={g.category.categoryId}>
              {g.category.categoryName}
            </option>
          ))}
        </select>

        {error && <p className="text-rose-400">{error}</p>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {loading && groups.length === 0
            ? Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl border border-white/5 bg-zinc-900" />
              ))
            : channels.map((ch) => (
                <button
                  key={ch.streamId}
                  onClick={() => navigate(`/watch/live/${ch.streamId}?name=${encodeURIComponent(ch.name)}`)}
                  className="flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-zinc-900/80 p-2 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400/50 hover:bg-zinc-800 hover:shadow-[0_0_0_1px_rgba(58,151,255,0.3),0_12px_28px_-10px_rgba(15,123,255,0.5)]"
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
          <p className="mt-8 text-center text-zinc-500">Nenhum canal encontrado.</p>
        )}

        {visibleCount < allChannels.length && <div ref={sentinelRef} className="h-10" />}
      </div>
    </div>
  )
}
