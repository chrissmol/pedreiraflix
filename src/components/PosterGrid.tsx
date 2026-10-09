import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PosterCard from './PosterCard'
import type { Movie, SeriesItem } from '../types'

interface PosterGridProps {
  items: Movie[] | SeriesItem[]
  kind: 'movie' | 'series'
  loading?: boolean
}

// Categoria com milhares de titulos (2295 no painel do Christian) levava ~4 s so para montar os cartoes.
// Monta um bloco e vai acrescentando quando o fim da grade chega perto da tela.
const STEP = 96

/** Grid layout (X by X) for browsing a single category in full — used instead of `CategoryRow`'s
 * horizontal scroller once the person has drilled into one specific category (via the category filter or
 * a "Ver tudo" link), where there's no longer a stack of other categories to keep compact, and a scrolling
 * single row of possibly hundreds of items is worse than just laying them all out. */
export default function PosterGrid({ items, kind, loading }: PosterGridProps) {
  const navigate = useNavigate()
  // O contador pertence a uma lista: ao trocar de categoria (outro array) volta ao primeiro bloco.
  const [grown, setGrown] = useState({ list: items, count: STEP })
  const count = grown.list === items ? grown.count : STEP
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || count >= items.length) return
    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setGrown({ list: items, count: count + STEP }),
      { rootMargin: '1500px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [items, count])

  if (loading && items.length === 0) {
    return (
      <div className="grid grid-cols-3 gap-3 px-4 sm:grid-cols-4 sm:px-10 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="skeleton aspect-2/3 rounded-xl border border-white/5 bg-surface-container" />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3 px-4 sm:grid-cols-4 sm:px-10 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
        {items.slice(0, count).map((item) =>
          kind === 'movie' ? (
            <PosterCard
              key={(item as Movie).streamId}
              fill
              title={item.name}
              image={(item as Movie).streamIcon}
              badge={item.rating && Number(item.rating) > 0 ? `★ ${Number(item.rating).toFixed(1)}` : null}
              onClick={() => navigate(`/movies/${(item as Movie).streamId}`)}
            />
          ) : (
            <PosterCard
              key={(item as SeriesItem).seriesId}
              fill
              title={item.name}
              image={(item as SeriesItem).cover}
              badge={item.rating && Number(item.rating) > 0 ? `★ ${Number(item.rating).toFixed(1)}` : null}
              onClick={() => navigate(`/series/${(item as SeriesItem).seriesId}`)}
            />
          ),
        )}
      </div>
      {count < items.length && <div ref={sentinel} aria-hidden="true" className="h-px" />}
    </>
  )
}
