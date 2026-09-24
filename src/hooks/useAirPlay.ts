import { useEffect, useState, type RefObject } from 'react'

type AirPlayVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void
}

/** AirPlay is a native Safari-only <video> API — no SDK, no external script, just a couple of prefixed
 * members that only exist in WebKit. Every other browser simply doesn't have them, so `supported` stays
 * false there and the caller hides the button entirely. */
export function useAirPlay(videoRef: RefObject<HTMLVideoElement | null>) {
  const [supported, setSupported] = useState(false)
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    const video = videoRef.current as AirPlayVideo | null
    if (!video || typeof video.webkitShowPlaybackTargetPicker !== 'function') return
    setSupported(true)

    function onAvailabilityChanged(e: Event) {
      const detail = e as unknown as { availability?: 'available' | 'not-available' }
      setAvailable(detail.availability === 'available')
    }
    video.addEventListener('webkitplaybacktargetavailabilitychanged', onAvailabilityChanged)
    return () => video.removeEventListener('webkitplaybacktargetavailabilitychanged', onAvailabilityChanged)
  }, [videoRef])

  function showPicker() {
    ;(videoRef.current as AirPlayVideo | null)?.webkitShowPlaybackTargetPicker?.()
  }

  return { supported, available, showPicker }
}
