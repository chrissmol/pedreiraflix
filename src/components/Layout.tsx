import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import MobileNav from './MobileNav'
import TopNav from './TopNav'

export default function Layout() {
  const sessionWarning = useAuthStore((s) => s.sessionWarning)
  const dismissWarning = useAuthStore((s) => s.dismissWarning)
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  // The router keeps the old scroll offset, so a new page would open halfway down. `body` itself never
  // scrolls (see index.css) — `<main>` below is the actual scrollable element now, so that's what gets
  // reset, not `window`.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [pathname])

  return (
    // `h-dvh` (dynamic viewport height), not `min-h-screen`/`100vh`: this outer frame is sized to the
    // real visible viewport and never scrolls itself — `<main>` is the one scrollable element on the
    // page (see the index.css comment on `html, body { overflow: hidden }` for why). It's also the
    // `position: relative` anchor every overlay in here (`TopNav`, `MobileNav`, the session-warning
    // banner) positions itself against with `absolute`, not `fixed` — see the comment on `TopNav`'s
    // header and `MobileNav`'s nav for why `fixed` specifically was still wrong on an iOS PWA even after
    // `body` stopped scrolling.
    <div className="relative h-dvh overflow-hidden">
      {/* Off-screen until focused (Tab from the very top of the page) — lets keyboard users jump past
          the header/nav straight to the page content instead of tabbing through every nav link first. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-[calc(0.75rem+env(safe-area-inset-top))] focus:z-[100] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <TopNav />
      {sessionWarning && (
        <div className="absolute inset-x-0 top-14 z-40 flex items-center justify-between gap-3 bg-amber-500/95 px-4 py-2 text-sm font-medium text-black sm:top-16">
          <span>{sessionWarning}</span>
          <button onClick={dismissWarning} className="shrink-0 rounded px-2 py-0.5 hover:bg-black/10">
            ✕
          </button>
        </div>
      )}
      <main
        id="main-content"
        ref={mainRef}
        className="h-full overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-0"
      >
        <Outlet />
      </main>
      <MobileNav />
    </div>
  )
}
