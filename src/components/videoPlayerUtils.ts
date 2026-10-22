import { connectionStatus, refreshSession } from '../lib/session'
import { useAuthStore } from '../store/auth'

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
  // Sem duracao = episodio que a serie pos em "Continuar assistindo" quando o anterior acabou (WatchPage).
  if (!durationSeconds) return 'Próximo episódio'
  const left = Math.max(0, Math.round((durationSeconds - positionSeconds) / 60))
  if (left === 0) return 'Quase no fim'
  return left >= 60 ? `Faltam ${Math.floor(left / 60)}h ${left % 60}min` : `Faltam ${left} min`
}

/** Quanto os botoes, o duplo toque, as setas do teclado e a tela de bloqueio pulam. Um valor so, para o numero
 * dentro do icone nunca divergir do que o botao faz. */
export const SKIP_SECONDS = 10

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

// 403 sem o provedor confirmar as telas cheias (09/10: era a Cloudflare barrando IP puro, "error code: 1003").
export const REFUSED_MESSAGE =
  'O provedor recusou este vídeo (HTTP 403). Tente outro canal ou volte a tentar em alguns minutos.'

// Canal ao vivo que chega como video fechado (#EXT-X-ENDLIST): o provedor manda um trecho de aviso no lugar do canal
// (conta real, 09/10: lista de 1 trecho de 10 s no bloqueio.example, que nao toca) e o player ficava "carregando" para sempre.
export const CHANNEL_BLOCKED_MESSAGE =
  'O provedor bloqueou este canal agora (mandou um aviso no lugar do vídeo). Tente de novo em alguns minutos.'

export const CHANNEL_NOT_FOUND_MESSAGE =
  'O provedor não entregou este canal (HTTP 404). Ele pode estar fora do ar ou a sua tela ainda ocupada: espere alguns minutos e tente de novo.'

export function supportsNativeHls() {
  // Safari (iOS and macOS) plays HLS natively — video.src = the .m3u8 directly, same as any other
  // <video>, no MediaSource involved. This has to be checked and preferred *before* even asking
  // hls.js whether it thinks the browser is supported: hls.js's own isSupported() checks for
  // MediaSource Extensions, which Safari also has, so that check alone can never tell Safari apart
  // from everyone else — every browser that can run hls.js at all was taking this branch, including
  // Safari, despite a comment below (now moved) claiming otherwise. The real, user-visible cost: HLS
  // delivered through MediaSource can only AirPlay as audio on iOS, not mirror actual video — a
  // documented WebKit/hls.js interaction, confirmed against a real Apple TV. Native playback doesn't
  // have that limit. The trade-off (accepted): no manual quality menu (Safari picks the level itself and
  // doesn't expose it); audio/subtitle tracks come from video.audioTracks/textTracks instead of hls.js.
  // Safari precisa tocar HLS nativamente, nao via hls.js, senao o video sai por MediaSource e o
  // AirPlay manda so o audio — a TV fica preta. O teste era `=== 'probably'`, e e justamente ai que
  // quebrava no iPhone: o Safari responde 'maybe' para este MIME em varias versoes, entao o app caia
  // no hls.js e o ao vivo nao aparecia na TV (relatado com uma Samsung via AirPlay 2).
  //
  // So que aceitar qualquer resposta nao-vazia tambem nao serve: o Chromium responde 'maybe' sem ter
  // HLS nativo nenhum. O desempate e por recurso, nao por string nem por user agent — as APIs de
  // midia prefixadas do WebKit (`webkitShowPlaybackTargetPicker`, usada pelo proprio botao de
  // AirPlay) existem no Safari e em nenhum outro lugar.
  const video = document.createElement('video')
  const canPlayHls = video.canPlayType('application/vnd.apple.mpegurl')
  const isWebKitMedia =
    typeof (video as { webkitShowPlaybackTargetPicker?: unknown }).webkitShowPlaybackTargetPicker === 'function' ||
    'webkitSupportsPresentationMode' in video
  return canPlayHls === 'probably' || (canPlayHls !== '' && isWebKitMedia)
}

// 403 nem sempre e o limite de telas (09/10: era a Cloudflare barrando IP puro e o app culpava as telas).
// So culpa as telas quando o provedor confirma, pelo numero de conexoes da conta.
export async function refusedMessage(fallback = REFUSED_MESSAGE): Promise<string> {
  if (useAuthStore.getState().credentials?.type !== 'xtream') return fallback
  await refreshSession()
  return connectionStatus(useAuthStore.getState().user)?.full ? SCREEN_LIMIT_MESSAGE : fallback
}
