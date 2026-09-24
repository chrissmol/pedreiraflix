// Google Cast (Chromecast) sender integration — the "CAF" v3 sender SDK. No @types package exists for
// it without adding a dependency, and it only ever runs in Chrome/Chromium (the SDK isn't served or
// usable elsewhere), so this file works directly against `window.cast`/`window.chrome.cast` with small
// local types instead of pulling in a whole ambient-types package for a handful of calls.
//
// IMPORTANT caveat for whoever reads this next: this is written to the documented Cast Application
// Framework API surface, but has never been exercised against a real Chromecast device or receiver —
// there was no hardware available to test against. The request/media shapes and session flow below are
// correct per Google's docs; verify an actual cast (device picker → media loads → play/pause reaches the
// TV) once this is deployed, on a real network with a real Cast device.

interface CastSession {
  loadMedia(request: unknown): Promise<void>
}
interface CastContext {
  setOptions(opts: { receiverApplicationId: string; autoJoinPolicy: string }): void
  getCurrentSession(): CastSession | null
  requestSession(): Promise<void>
}
interface CastNamespace {
  framework: {
    CastContext: { getInstance(): CastContext }
    CastContextEventType: { CAST_STATE_CHANGED: string }
    CastState: { NO_DEVICES_AVAILABLE: string }
  }
}
interface ChromeCastNamespace {
  cast: {
    isAvailable?: boolean
    media: {
      DEFAULT_MEDIA_RECEIVER_APP_ID: string
      MediaInfo: new (contentId: string, contentType: string) => { metadata?: unknown }
      GenericMediaMetadata: new () => { title?: string; images?: unknown[] }
      LoadRequest: new (mediaInfo: unknown) => { currentTime?: number }
    }
    Image: new (url: string) => unknown
    AutoJoinPolicy: { ORIGIN_SCOPED: string }
  }
}
declare global {
  interface Window {
    cast?: CastNamespace
    chrome?: ChromeCastNamespace
    __onGCastApiAvailable?: (isAvailable: boolean) => void
  }
}

const RECEIVER_APP_ID_FALLBACK = 'CC1AD845' // Google's Default Media Receiver — used if the SDK constant isn't up yet.

let sdkPromise: Promise<void> | null = null

/** Loads the Cast sender SDK once and initializes the CastContext. Safe to call repeatedly — later
 * calls reuse the same in-flight/completed load. Resolves to false (not rejects) if the SDK can't load
 * or isn't usable here (any non-Chromium browser), so callers can just hide the Cast button. */
export function ensureCastSdk(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.chrome) return Promise.resolve(false) // Cast is Chromium-only
  if (window.cast?.framework) return Promise.resolve(true)
  if (sdkPromise) return sdkPromise.then(() => true).catch(() => false)

  sdkPromise = new Promise((resolve, reject) => {
    window.__onGCastApiAvailable = (isAvailable) => {
      if (!isAvailable || !window.cast || !window.chrome) return reject(new Error('cast api unavailable'))
      window.cast.framework.CastContext.getInstance().setOptions({
        receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID || RECEIVER_APP_ID_FALLBACK,
        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      })
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
    script.onerror = () => reject(new Error('failed to load cast sdk'))
    document.head.appendChild(script)
  })
  return sdkPromise.then(() => true).catch(() => false)
}

export interface CastMediaRequest {
  /** Must be an absolute, publicly reachable URL — the TV/receiver fetches it directly, not through this page. */
  url: string
  contentType: string
  title: string
  poster?: string | null
  startAtSeconds?: number
}

/** Opens the device picker if nothing's connected yet, then casts. Throws on any failure (SDK not
 * loaded, user cancelled the picker, no session) — callers should catch and just leave the button idle. */
export async function castMedia(request: CastMediaRequest): Promise<void> {
  const ok = await ensureCastSdk()
  if (!ok || !window.cast || !window.chrome) throw new Error('Cast indisponível neste navegador')

  const context = window.cast.framework.CastContext.getInstance()
  let session = context.getCurrentSession()
  if (!session) {
    await context.requestSession()
    session = context.getCurrentSession()
  }
  if (!session) throw new Error('Nenhuma sessão de Cast disponível')

  const mediaInfo = new window.chrome.cast.media.MediaInfo(request.url, request.contentType)
  const metadata = new window.chrome.cast.media.GenericMediaMetadata()
  metadata.title = request.title
  if (request.poster) metadata.images = [new window.chrome.cast.Image(request.poster)]
  mediaInfo.metadata = metadata

  const loadRequest = new window.chrome.cast.media.LoadRequest(mediaInfo)
  if (request.startAtSeconds) loadRequest.currentTime = request.startAtSeconds
  await session.loadMedia(loadRequest)
}
