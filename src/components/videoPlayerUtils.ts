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

/** "01:32:00" (what Xtream sends as a movie's length) -> "1h 32min"; "00:20:00" -> "20min". Anything that
 * isn't a clock string is handed back as-is, since some panels put free text in this field. */
export function formatRuntime(raw: string | null): string | null {
  if (!raw) return null
  const parts = raw.trim().split(':').map(Number)
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return raw
  const [h, m] = parts.length === 3 ? parts : [0, parts[0]]
  const total = h * 60 + m
  if (total <= 0) return null
  return total >= 60 ? `${Math.floor(total / 60)}h ${total % 60 > 0 ? `${total % 60}min` : ''}`.trim() : `${total}min`
}

/** "Faltam 18 min" diz mais do que "68% assistido" na hora de escolher o que ver agora. */
export function formatRemaining(positionSeconds: number, durationSeconds: number): string {
  const left = Math.max(0, Math.round((durationSeconds - positionSeconds) / 60))
  if (!durationSeconds || left === 0) return 'Quase no fim'
  return left >= 60 ? `Faltam ${Math.floor(left / 60)}h ${left % 60}min` : `Faltam ${left} min`
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

// O Xtream responde 403 quando a conta ja esta tocando no limite de telas (confirmado pelo Christian: outro
// aparelho com o mesmo login). Sem isso o player dizia "formato nao suportado", que manda procurar o
// problema no lugar errado.
export const SCREEN_LIMIT_MESSAGE =
  'O provedor recusou: sua conta já está tocando em outro aparelho. Feche lá (ou espere alguns minutos) e tente de novo.'
