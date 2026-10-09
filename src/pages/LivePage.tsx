import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FilterBar from '../components/FilterBar'
import { Calendar, ChevronDown, ChevronRight, Search } from '../components/icons'
import LiveChannelCard from '../components/LiveChannelCard'
import { useLiveCatalog } from '../hooks/useCatalog'
import { CHANNEL_GROUPS, type ChannelGroup, channelGroupOf, cleanCategoryName } from '../lib/channelGroups'
import { matchesQuery } from '../lib/search'
import { favoritesFor, useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'
import ErrorCard from '../components/ErrorCard'

const PAGE_SIZE = 60

export default function LivePage() {
  const { groups, loading, error, retry } = useLiveCatalog()
  const profileId = useActiveProfileId()
  const recentIds = useLibraryStore((s) => s.recentLive[profileId])
  // O que esta escolhido: 'recent' | 'all' | `g:<grupo>` | `c:<categoria>`. Abre em Recentes (pedido do
  // Christian); sem canais recentes, em Todos.
  const [selection, setSelection] = useState(() => (recentIds?.length ? 'recent' : 'all'))
  const activeCategory = selection.startsWith('c:') ? selection.slice(2) : null
  const [filter, setFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  // Live channels have none of movies/series' catalog metadata (no genre/year/rating from the provider)
  // — catch-up/archive availability is the one thing on the base listing worth filtering by here.
  const [onlyArchive, setOnlyArchive] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const visibleCategories = useMemo(() => groups.filter((g) => g.items.length > 0), [groups])

  // Categorias por grupo (TV aberta, Esportes...), na ordem fixa dos grupos; grupo vazio nao aparece.
  const categoriesByGroup = useMemo(() => {
    const map = new Map<ChannelGroup, typeof visibleCategories>()
    for (const g of visibleCategories) {
      const group = channelGroupOf(g.category.categoryName)
      map.set(group, [...(map.get(group) ?? []), g])
    }
    return CHANNEL_GROUPS.flatMap((group) => (map.has(group) ? [[group, map.get(group)!] as const] : []))
  }, [visibleCategories])
  const groupOfSelection =
    selection.startsWith('g:')
      ? selection.slice(2)
      : activeCategory
        ? channelGroupOf(visibleCategories.find((g) => g.category.categoryId === activeCategory)?.category.categoryName ?? '')
        : null
  // Lista lateral: grupos recolhidos, menos o da categoria escolhida.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const isOpen = (group: string) => openGroups.has(group) || group === groupOfSelection || categoryFilter.trim() !== ''
  const toggleGroup = (group: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (isOpen(group) && group !== groupOfSelection) next.delete(group)
      else next.add(group)
      return next
    })

  // Zapping is a handful of channels, not the whole lineup — favourites come first so getting to them
  // never means scrolling (or remembering which category they're filed under).
  const favoritesRecord = useLibraryStore((s) => s.favorites)
  const favoriteChannels = useMemo(() => {
    const ids = new Set(favoritesFor(favoritesRecord, profileId).filter((f) => f.kind === 'live').map((f) => f.id))
    if (ids.size === 0) return []
    return groups.flatMap((g) => g.items).filter((c) => ids.has(c.streamId))
  }, [favoritesRecord, profileId, groups])

  const recentChannels = useMemo(() => {
    const byId = new Map(visibleCategories.flatMap((g) => g.items.map((c) => [c.streamId, c] as const)))
    return (recentIds ?? []).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
  }, [recentIds, visibleCategories])
  // Recentes sem nenhum canal achado no catalogo (ainda carregando ou canal que saiu) mostra Todos.
  const showingRecent = selection === 'recent' && recentChannels.length > 0

  const allChannels = useMemo(() => {
    const scopedGroups = activeCategory
      ? visibleCategories.filter((g) => g.category.categoryId === activeCategory)
      : selection.startsWith('g:')
        ? visibleCategories.filter((g) => channelGroupOf(g.category.categoryName) === selection.slice(2))
        : visibleCategories
    if (showingRecent && !filter.trim()) return onlyArchive ? recentChannels.filter((c) => c.hasArchive) : recentChannels

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
  }, [visibleCategories, activeCategory, selection, showingRecent, recentChannels, filter, onlyArchive])

  const channels = allChannels.slice(0, visibleCount)

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- filter/category changes must restart infinite scroll.
    setVisibleCount(PAGE_SIZE)
  }, [selection, filter, onlyArchive])

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
        ? 'bg-brand-fill text-white shadow-[0_0_20px_-4px_rgba(15,123,255,0.6)]'
        : 'bg-surface-container text-on-surface-variant hover:bg-surface-high hover:text-white'
    }`
  const sideItem = (active: boolean) =>
    `flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-label-md transition-colors ${
      active ? 'bg-brand-500/15 text-brand-300' : 'text-on-surface-variant hover:bg-surface-high hover:text-white'
    }`
  const tab = (active: boolean) =>
    // 44px de altura para o dedo (com pb-2 eram 29px — achado do /estressar-apk, 08/10).
    `flex h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-1 text-label-md transition-colors ${
      active ? 'border-brand-500 text-white' : 'border-transparent text-on-surface-variant'
    }`
  const matchesCategoryFilter = (name: string) => !categoryFilter.trim() || matchesQuery(cleanCategoryName(name), categoryFilter)
  const selectionTitle =
    showingRecent
      ? 'Recentes'
      : activeCategory
        ? cleanCategoryName(visibleCategories.find((g) => g.category.categoryId === activeCategory)?.category.categoryName ?? '')
        : selection.startsWith('g:')
          ? selection.slice(2)
          : 'Todos os canais'

  return (
    <div className="min-h-screen px-4 pb-10 pt-[calc(5rem+env(safe-area-inset-top))] sm:px-10 sm:pt-24">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <h1 className="font-display text-headline-md text-white sm:text-headline-lg">Canais ao vivo</h1>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-muted" />
            <input
              type="search"
              placeholder="Filtrar canais…"
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

      {/* Celular: grupos em abas e, embaixo, as categorias do grupo em pilulas (a lista lateral nao cabe).
          Antes eram 38 pilulas em caixa alta quebrando em 5 linhas (print do Christian, 08/10). */}
      <div className="md:hidden">
        <div role="tablist" aria-label="Grupos de canais" className="no-scrollbar -mx-4 mb-3 flex gap-5 overflow-x-auto border-b border-outline-soft px-4">
          {recentChannels.length > 0 && (
            <button role="tab" aria-selected={showingRecent} onClick={() => setSelection('recent')} className={tab(showingRecent)}>
              Recentes
            </button>
          )}
          <button role="tab" aria-selected={selection === 'all'} onClick={() => setSelection('all')} className={tab(selection === 'all' || (selection === 'recent' && !showingRecent))}>
            Todos
          </button>
          {categoriesByGroup.map(([group]) => (
            <button key={group} role="tab" aria-selected={groupOfSelection === group} onClick={() => setSelection(`g:${group}`)} className={tab(groupOfSelection === group)}>
              {group}
            </button>
          ))}
        </div>
        {groupOfSelection && (
          <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4">
            <button onClick={() => setSelection(`g:${groupOfSelection}`)} aria-pressed={selection === `g:${groupOfSelection}`} className={pill(selection === `g:${groupOfSelection}`)}>
              Tudo
            </button>
            {(categoriesByGroup.find(([group]) => group === groupOfSelection)?.[1] ?? []).map((g) => (
              <button
                key={g.category.categoryId}
                onClick={() => setSelection(`c:${g.category.categoryId}`)}
                aria-pressed={activeCategory === g.category.categoryId}
                className={pill(activeCategory === g.category.categoryId)}
              >
                {cleanCategoryName(g.category.categoryName)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:gap-8">
        {/* Computador e tablet: lista lateral com as categorias em grupos que abrem e fecham. */}
        <aside aria-label="Categorias" className="hidden md:sticky md:top-24 md:block md:max-h-[calc(100dvh-8rem)] md:self-start md:overflow-y-auto">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-muted" />
            <input
              type="search"
              placeholder="Filtrar categorias"
              aria-label="Filtrar categorias"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="brand-focus h-10 w-full rounded-xl border border-outline-soft bg-surface-container pl-9 pr-3 text-body-sm text-white placeholder-on-surface-muted"
            />
          </div>
          <button onClick={() => setSelection('all')} aria-pressed={selection === 'all' || (selection === 'recent' && !showingRecent)} className={sideItem(selection === 'all' || (selection === 'recent' && !showingRecent))}>
            Todos os canais <span className="text-label-badge text-on-surface-muted">{totalChannels}</span>
          </button>
          {recentChannels.length > 0 && (
            <button onClick={() => setSelection('recent')} aria-pressed={showingRecent} className={sideItem(showingRecent)}>
              Recentes <span className="text-label-badge text-on-surface-muted">{recentChannels.length}</span>
            </button>
          )}
          {categoriesByGroup.map(([group, categories]) => {
            const shown = categories.filter((g) => matchesCategoryFilter(g.category.categoryName))
            if (shown.length === 0) return null
            const open = isOpen(group)
            return (
              <div key={group} className="mt-2">
                <button
                  onClick={() => toggleGroup(group)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-label-badge uppercase tracking-wider text-on-surface-muted hover:text-white"
                >
                  {group}
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {open &&
                  shown.map((g) => (
                    <button
                      key={g.category.categoryId}
                      onClick={() => setSelection(`c:${g.category.categoryId}`)}
                      aria-pressed={activeCategory === g.category.categoryId}
                      className={`${sideItem(activeCategory === g.category.categoryId)} pl-5`}
                    >
                      <span className="truncate">{cleanCategoryName(g.category.categoryName)}</span>
                      <span className="text-label-badge text-on-surface-muted">{g.items.length}</span>
                    </button>
                  ))}
              </div>
            )
          })}
        </aside>

        <div className="min-w-0">
      <h2 className="font-display mb-4 hidden text-headline-sm text-white md:block">{selectionTitle}</h2>

      {favoriteChannels.length > 0 && !filter.trim() && selectionTitle === 'Todos os canais' && !onlyArchive && (
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
      </div>
    </div>
  )
}
