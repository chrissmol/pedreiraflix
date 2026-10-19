import { type KeyboardEvent, type ReactNode, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from './icons'

interface RowProps {
  title: string
  children?: ReactNode
  loading?: boolean
  /** Shows a "Ver tudo" link next to the title — for a row that's a capped preview of a bigger category
   * (Home), not for a row that already lists every item in its category (Filmes/Séries themselves). */
  seeAllHref?: string
}

export default function Row({ title, children, loading, seeAllHref }: RowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  function scrollBy(amount: number) {
    scrollerRef.current?.scrollBy({ left: amount, behavior: 'smooth' })
  }

  // Arrow-key navigation between posters, like a TV remote/Netflix: focus already lands on each
  // poster via Tab (they're plain <button>s), this just adds ←/→ as a faster way to move within a
  // row without needing a pointer, and keeps the newly-focused card scrolled into view.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const scroller = scrollerRef.current
    if (!scroller) return
    const focusables = Array.from(scroller.querySelectorAll<HTMLElement>('button, [href], [tabindex]'))
    const currentIndex = focusables.indexOf(document.activeElement as HTMLElement)
    if (currentIndex === -1) return
    const next = focusables[currentIndex + (e.key === 'ArrowRight' ? 1 : -1)]
    // Na ponta da fileira a seta segue adiante: na TV, a esquerda do primeiro poster leva ao menu lateral.
    if (!next) return
    e.preventDefault()
    next.focus()
    next.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  return (
    <section className="mb-12">
      <h2 className="font-display mb-3 flex items-center gap-2 px-4 text-headline-sm text-white sm:px-10 sm:text-headline-md">
        <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brand-400 to-brand-600 shadow-none" />
        {title || <span className="skeleton h-5 w-40 rounded" />}
        {seeAllHref && (
          <Link
            to={seeAllHref}
            className="brand-focus ml-1 rounded-full px-2.5 py-0.5 text-label-badge font-semibold text-brand-400 transition-colors hover:bg-surface-high hover:text-brand-300"
          >
            Ver tudo
          </Link>
        )}
      </h2>
      <div className="relative">
        <button
          onClick={() => scrollBy(-600)}
          aria-label={`Rolar "${title}" para a esquerda`}
          className="absolute inset-y-0 left-0 z-20 hidden w-12 items-center justify-center bg-gradient-to-r from-surface to-transparent transition-opacity sm:flex"
        >
          <ChevronLeft className="h-8 w-8 text-white" />
        </button>

        <div
          ref={scrollerRef}
          onKeyDown={onKeyDown}
          className="no-scrollbar flex gap-4 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-4 pt-6 sm:px-10"
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="skeleton aspect-2/3 w-32 shrink-0 rounded-xl border border-white/5 bg-surface-container sm:w-40 md:w-44"
                />
              ))
            : children}
        </div>

        <button
          onClick={() => scrollBy(600)}
          aria-label={`Rolar "${title}" para a direita`}
          className="absolute inset-y-0 right-0 z-20 hidden w-12 items-center justify-center bg-gradient-to-l from-surface to-transparent transition-opacity sm:flex"
        >
          <ChevronRight className="h-8 w-8 text-white" />
        </button>
      </div>
    </section>
  )
}
