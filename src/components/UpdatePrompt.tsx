import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from './icons'

/** Offers the new build instead of silently sitting on the old one. The service worker deliberately does
 * not call skipWaiting() on install (see public/sw.js), so a finished update parks in `waiting` until
 * someone taps here — nothing is ever swapped out mid-playback. An installed PWA can stay open for days
 * without a navigation, which is exactly the case where an update would otherwise never land. */
export default function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  // Only a reload we asked for: `controllerchange` also fires the first time a worker takes control of a
  // page that had none, and reloading there would be a pointless flash on first visit.
  const accepted = useRef(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let cancelled = false

    const onControllerChange = () => {
      if (accepted.current) window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    let registration: ServiceWorkerRegistration | undefined
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => {})
    }

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg || cancelled) return
      registration = reg
      if (reg.waiting) setWaiting(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        installing?.addEventListener('statechange', () => {
          // `controller` is null on the very first install — that is a fresh start, not an update.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) setWaiting(installing)
        })
      })
      // Browsers only check for a new worker on navigation, which an installed app may go days without.
      document.addEventListener('visibilitychange', checkForUpdate)
      checkForUpdate()
    })

    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', checkForUpdate)
    }
  }, [])

  if (!waiting) return null

  return (
    <div
      role="status"
      className="glass-panel absolute inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex items-center gap-3 rounded-xl px-4 py-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-80"
    >
      <span className="flex-1 text-sm text-white">Nova versão disponível</span>
      <button
        onClick={() => {
          accepted.current = true
          waiting.postMessage({ type: 'SKIP_WAITING' })
        }}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-black transition-transform hover:scale-[1.03]"
      >
        <RefreshCw className="h-4 w-4" /> Atualizar
      </button>
      <button
        onClick={() => setWaiting(null)}
        aria-label="Agora não"
        className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-zinc-400 hover:text-white"
      >
        ✕
      </button>
    </div>
  )
}
