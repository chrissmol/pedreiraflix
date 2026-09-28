import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import MobileNav from './MobileNav'
import TopNav from './TopNav'

export default function Layout() {
  const sessionWarning = useAuthStore((s) => s.sessionWarning)
  const dismissWarning = useAuthStore((s) => s.dismissWarning)
  const { pathname } = useLocation()

  // The router keeps the old scroll offset, so a new page would open halfway down.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-screen pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0">
      {/* Off-screen until focused (Tab from the very top of the page) — lets keyboard users jump past
          the header/nav straight to the page content instead of tabbing through every nav link first. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-[calc(0.75rem+env(safe-area-inset-top))] focus:z-[100] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <TopNav />
      {sessionWarning && (
        <div className="fixed inset-x-0 top-14 z-40 flex items-center justify-between gap-3 bg-amber-500/95 px-4 py-2 text-sm font-medium text-black sm:top-16">
          <span>{sessionWarning}</span>
          <button onClick={dismissWarning} className="shrink-0 rounded px-2 py-0.5 hover:bg-black/10">
            ✕
          </button>
        </div>
      )}
      <main id="main-content">
        <Outlet />
      </main>
      <MobileNav />
    </div>
  )
}
