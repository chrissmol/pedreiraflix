import { memo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import PosterCard from './PosterCard'
import Row from './Row'
import type { Movie, SeriesItem } from '../types'

interface CategoryRowProps {
  title: string
  loading: boolean
  items: Movie[] | SeriesItem[]
  kind: 'movie' | 'series'
  /** Caps how many posters render (Home's rows are a preview, not the full category) — applied here,
   * inside the memoized component, rather than by `.slice()`-ing `items` before it gets here: `.slice()`
   * always returns a new array, which would defeat the reference-equality check below on every render. */
  limit?: number
  /** Needed to build the "Ver tudo" link — only Home passes this (Filmes/Séries' own rows already show
   * every item in the category, so there's nothing more to link to). */
  categoryId?: string
}

// Memoized deliberately: Filmes/Séries/Início load categories progressively (one API call per
// category), and every time one resolves, the page holding all the rows re-renders. Without this, every
// row already on screen re-renders and re-diffs its whole subtree each time a *later* category finishes
// loading — visible as jank/flicker the more categories a provider has. React.memo's default shallow
// prop comparison only skips that work if `items` is the *same array reference* when nothing about this
// specific row changed, which is exactly what the callers below preserve (see their comments).
function CategoryRow({ title, loading, items, kind, limit, categoryId }: CategoryRowProps) {
  const navigate = useNavigate()
  const visible = limit != null ? items.slice(0, limit) : items
  const seeAllHref =
    categoryId && limit != null && items.length > limit
      ? `/${kind === 'movie' ? 'movies' : 'series'}?category=${encodeURIComponent(categoryId)}`
      : undefined

  // Dev-only render counter (statically stripped from the production bundle — `import.meta.env.DEV` is
  // replaced at build time and the branch is dead-code-eliminated) so e2e tests can assert the
  // memoization above is actually doing its job, not just that the page still renders correctly.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __categoryRowRenders?: Record<string, number> }
    w.__categoryRowRenders ??= {}
    w.__categoryRowRenders[title] = (w.__categoryRowRenders[title] ?? 0) + 1
  })
  return (
    <Row title={title} loading={loading} seeAllHref={seeAllHref}>
      {visible.map((item) =>
        kind === 'movie' ? (
          <PosterCard
            key={(item as Movie).streamId}
            title={item.name}
            image={(item as Movie).streamIcon}
            badge={item.rating && Number(item.rating) > 0 ? `★ ${Number(item.rating).toFixed(1)}` : null}
            onClick={() => navigate(`/movies/${(item as Movie).streamId}`)}
          />
        ) : (
          <PosterCard
            key={(item as SeriesItem).seriesId}
            title={item.name}
            image={(item as SeriesItem).cover}
            badge={item.rating && Number(item.rating) > 0 ? `★ ${Number(item.rating).toFixed(1)}` : null}
            onClick={() => navigate(`/series/${(item as SeriesItem).seriesId}`)}
          />
        ),
      )}
    </Row>
  )
}

export default memo(CategoryRow)
