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
      <TopNav />
      {sessionWarning && (
        <div className="fixed inset-x-0 top-14 z-40 flex items-center justify-between gap-3 bg-amber-500/95 px-4 py-2 text-sm font-medium text-black sm:top-16">
          <span>{sessionWarning}</span>
          <button onClick={dismissWarning} className="shrink-0 rounded px-2 py-0.5 hover:bg-black/10">
            ✕
          </button>
        </div>
      )}
      <main>
        <Outlet />
      </main>
      <MobileNav />
    </div>
  )
}
