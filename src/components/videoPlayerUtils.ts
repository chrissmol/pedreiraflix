export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
// Auto-advance countdown, in seconds before the episode ends.
export const NEXT_UP_LEAD = 12

// Chrome/Edge expose a rough downlink estimate (Mbps) via the Network
// Information API. When present, seed hls.js's bandwidth estimator with it
// so a connection that's already fast starts at a high quality level
// immediately instead of ramping up from a conservative default guess.
export function estimateInitialBandwidthBps(): number | undefined {
  const nav = navigator as Navigator & { connection?: { downlink?: number } }
  const downlinkMbps = nav.connection?.downlink
  if (!downlinkMbps || downlinkMbps <= 0) return undefined
  return Math.round(downlinkMbps * 1_000_000 * 0.8)
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export const CUE_SIZE_EM_BY_SUBTITLE_SIZE = { small: 0.9, medium: 1.3, large: 1.8 }
export const CUE_BG_BY_SUBTITLE_BACKGROUND = {
  none: 'transparent',
  semi: 'rgba(0, 0, 0, 0.65)',
  solid: 'rgba(0, 0, 0, 0.95)',
}
