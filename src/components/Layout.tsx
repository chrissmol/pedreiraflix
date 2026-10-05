import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import MobileNav from './MobileNav'
import TopNav from './TopNav'

// Per-history-entry scroll offsets. Deliberately module scope, not a store: this is throwaway UI state
// for the current page session (a reload starts a fresh history anyway), not something to persist.
const scrollOffsets = new Map<string, number>()

export default function Layout() {
  const sessionWarning = useAuthStore((s) => s.sessionWarning)
  const dismissWarning = useAuthStore((s) => s.dismissWarning)
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  // The router keeps the old scroll offset, so a new page would open halfway down. `body` itself never
  // scrolls (see index.css) — `<main>` below is the actual scrollable element now, so that's what gets
  // reset, not `window`.
  //
  // Except on Back/Forward: every native app (and every browser, for normal page scrolling) returns you
  // to where you were in the list, instead of to the top. React Router reports that as navigationType
  // 'POP', and each history entry gets its own `key`, which is what the saved offset is stored under.
  const navigationType = useNavigationType()
  const { key } = useLocation()
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    const target = navigationType === 'POP' ? (scrollOffsets.get(key) ?? 0) : 0
    main.scrollTo(0, target)

    // The page we came back to re-renders from scratch and its rows arrive one category at a time, so at
    // this point it's usually still too short to scroll that far and the line above silently clamps to 0.
    // Re-apply while it grows, and stop at the first real user scroll so this never fights the person.
    let observer: ResizeObserver | undefined
    if (target > 0 && main.scrollTop < target) {
      const stop = () => {
        observer?.disconnect()
        main.removeEventListener('wheel', stop)
        main.removeEventListener('touchstart', stop)
      }
      observer = new ResizeObserver(() => {
        if (main.scrollTop >= target) stop()
        else main.scrollTo(0, target)
      })
      observer.observe(main)
      if (main.firstElementChild) observer.observe(main.firstElementChild)
      main.addEventListener('wheel', stop, { passive: true, once: true })
      main.addEventListener('touchstart', stop, { passive: true, once: true })
    }

    // Recorded as it scrolls, not on the way out: the app has a single Suspense boundary (App.tsx), so
    // navigating to a lazy route unmounts this whole subtree first — by cleanup time `<main>` is already
    // detached from the document and every detached element reports scrollTop 0.
    const remember = () => {
      scrollOffsets.set(key, main.scrollTop)
    }
    main.addEventListener('scroll', remember, { passive: true })

    return () => {
      observer?.disconnect()
      main.removeEventListener('scroll', remember)
    }
  }, [pathname, navigationType, key])

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
