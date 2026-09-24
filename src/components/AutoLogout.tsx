import { useEffect, useRef } from 'react'
import { useAuthStore } from '../store/auth'

// A shared/public computer left signed in is the actual risk this guards against — not a
// second-by-second security boundary, so the timeout is generous rather than banking-app strict.
// `__AUTO_LOGOUT_MS_OVERRIDE__` lets e2e tests set a millisecond-scale timeout instead of waiting 2h;
// it's never set outside a test harness, so this is a no-op in the real app.
const INACTIVITY_TIMEOUT_MS =
  (typeof window !== 'undefined' && (window as { __AUTO_LOGOUT_MS_OVERRIDE__?: number }).__AUTO_LOGOUT_MS_OVERRIDE__) ||
  2 * 60 * 60 * 1000
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const

/** Logs out after a long stretch with no interaction at all — but never while a video is actually
 * playing (hands-off movie/series watching produces no pointer/keyboard activity by design, and would
 * otherwise get logged out mid-playback). Mounted once, for the whole app; a no-op until a session exists. */
export default function AutoLogout() {
  const hasSession = useAuthStore((s) => Boolean(s.credentials))
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!hasSession) return

    function isVideoActivelyPlaying(): boolean {
      const video = document.querySelector('video')
      return !!video && !video.paused && !video.ended
    }

    function fire() {
      if (isVideoActivelyPlaying()) {
        schedule() // still watching — check again later instead of signing out mid-movie
        return
      }
      useAuthStore.getState().logout()
    }

    function schedule() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(fire, INACTIVITY_TIMEOUT_MS)
    }

    schedule()
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, schedule, { passive: true })
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, schedule)
    }
  }, [hasSession])

  return null
}
