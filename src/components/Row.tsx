import { type KeyboardEvent, type ReactNode, useRef } from 'react'
import { ChevronLeft, ChevronRight } from './icons'

interface RowProps {
  title: string
  children?: ReactNode
  loading?: boolean
}

export default function Row({ title, children, loading }: RowProps) {
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
    e.preventDefault()
    const nextIndex = currentIndex + (e.key === 'ArrowRight' ? 1 : -1)
    const next = focusables[nextIndex]
    next?.focus()
    next?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  return (
    <section className="mb-9">
      <h2 className="font-display mb-3 flex items-center gap-2 px-4 text-lg font-bold text-white sm:px-10">
        <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brand-400 to-brand-600 shadow-[0_0_8px_rgba(15,123,255,0.7)]" />
        {title}
      </h2>
      <div className="group/row relative">
        <button
          onClick={() => scrollBy(-600)}
          aria-label={`Rolar "${title}" para a esquerda`}
          className="absolute inset-y-0 left-0 z-20 hidden w-12 items-center justify-center bg-gradient-to-r from-[#06070c] to-transparent opacity-0 transition-opacity group-hover/row:opacity-100 sm:flex"
        >
          <ChevronLeft className="h-8 w-8 text-brand-300 drop-shadow-[0_0_8px_rgba(15,123,255,0.6)]" />
        </button>

        <div
          ref={scrollerRef}
          onKeyDown={onKeyDown}
          className="no-scrollbar flex gap-3 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-4 pt-6 sm:px-10"
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="skeleton aspect-2/3 w-32 shrink-0 rounded-xl border border-white/5 bg-zinc-900 sm:w-40"
                />
              ))
            : children}
        </div>

        <button
          onClick={() => scrollBy(600)}
          aria-label={`Rolar "${title}" para a direita`}
          className="absolute inset-y-0 right-0 z-20 hidden w-12 items-center justify-center bg-gradient-to-l from-[#06070c] to-transparent opacity-0 transition-opacity group-hover/row:opacity-100 sm:flex"
        >
          <ChevronRight className="h-8 w-8 text-brand-300 drop-shadow-[0_0_8px_rgba(15,123,255,0.6)]" />
        </button>
      </div>
    </section>
  )
}
