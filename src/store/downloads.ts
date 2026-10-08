import { create } from 'zustand'
import {
  deleteDownload,
  deleteParts,
  type DownloadMeta,
  estimateStorage,
  getDownload,
  listDownloadMeta,
  PART_BYTES,
  putDownload,
  putPart,
} from '../lib/offlineStore'
import type { ProviderClient } from '../lib/provider'

interface DownloadsState {
  // Metadata mirror of IndexedDB, per profile — the Blobs themselves never touch this store (or
  // localStorage): they're read from IndexedDB only at the moment playback actually needs them.
  items: Record<string, DownloadMeta[]>
  // 0–100 while a download is in flight; absent once it's done (moved into `items`) or failed.
  progress: Record<string, number>
  /** Why the last attempt failed, shown on the button; absent/empty when it didn't. */
  failed: Record<string, string>
  refresh: (profileId: string) => Promise<void>
  remove: (profileId: string, key: string) => Promise<void>
  start: (
    client: ProviderClient,
    profileId: string,
    kind: 'movie' | 'series',
    id: string,
    ext: string,
    name: string,
    image: string | null,
    seriesId?: number,
  ) => Promise<void>
  /** Season downloads in flight, by `${profileId}:season-${seriesId}-${season}`: how far the queue got. */
  seasons: Record<string, { done: number; total: number }>
  startSeason: (
    client: ProviderClient,
    profileId: string,
    seasonKey: string,
    seriesId: number,
    episodes: { id: string; ext: string; name: string }[],
    image: string | null,
  ) => Promise<void>
  /** Stops the queue after the episode currently downloading (that one finishes normally). */
  stopSeason: (seasonKey: string) => void
}

const stopRequested = new Set<string>()

const EMPTY: DownloadMeta[] = []

export const useDownloadsStore = create<DownloadsState>()((set, get) => ({
  items: {},
  progress: {},
  failed: {},
  seasons: {},
  // One episode at a time: each download holds one of the provider's screens, and the phone's memory and
  // bandwidth go to finishing one file instead of crawling through ten.
  startSeason: async (client, profileId, seasonKey, seriesId, episodes, image) => {
    if (get().seasons[seasonKey]) return
    stopRequested.delete(seasonKey)
    const total = episodes.length
    set((state) => ({ seasons: { ...state.seasons, [seasonKey]: { done: 0, total } } }))
    // Keeps the screen on: a locked iPhone pauses the PWA and kills the download. Released on its own
    // when the app goes to the background; best effort where unsupported.
    const wakeLock = await navigator.wakeLock?.request('screen').catch(() => null)
    try {
      for (const [i, ep] of episodes.entries()) {
        if (stopRequested.has(seasonKey)) break
        await get().start(client, profileId, 'series', ep.id, ep.ext, ep.name, image, seriesId)
        // No point trying the rest on a full disk.
        if (get().failed[`${profileId}:series-${ep.id}`]?.startsWith('Sem espaço')) break
        set((state) => ({ seasons: { ...state.seasons, [seasonKey]: { done: i + 1, total } } }))
      }
    } finally {
      await wakeLock?.release().catch(() => {})
      stopRequested.delete(seasonKey)
      set((state) => {
        const seasons = { ...state.seasons }
        delete seasons[seasonKey]
        return { seasons }
      })
    }
  },
  stopSeason: (seasonKey) => {
    stopRequested.add(seasonKey)
  },
  refresh: async (profileId) => {
    const meta = await listDownloadMeta(profileId)
    set((state) => ({ items: { ...state.items, [profileId]: meta } }))
  },
  remove: async (profileId, key) => {
    await deleteDownload(key)
    set((state) => ({ items: { ...state.items, [profileId]: (state.items[profileId] ?? EMPTY).filter((d) => d.key !== key) } }))
  },
  start: async (client, profileId, kind, id, ext, name, image, seriesId) => {
    const key = `${profileId}:${kind}-${id}`
    if (get().progress[key] !== undefined) return // already downloading
    set((state) => ({ progress: { ...state.progress, [key]: 0 }, failed: { ...state.failed, [key]: '' } }))

    // Asks the browser not to evict downloads under storage pressure (iOS otherwise may wipe them after a
    // while). Best effort: the browser can say no, and the download still goes ahead.
    navigator.storage?.persist?.().catch(() => {})

    let failure = 'Falhou — toque para tentar de novo'
    try {
      const res = await fetch(client.streamUrl(kind, id, ext))
      if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`)
      const totalBytes = Number(res.headers.get('content-length')) || 0
      const contentType = res.headers.get('content-type') || 'video/mp4'

      const storage = await estimateStorage()
      if (totalBytes > 0 && storage && totalBytes > storage.quotaBytes - storage.usageBytes) {
        await res.body.cancel()
        failure = 'Sem espaço no aparelho para este vídeo'
        throw new Error('no space')
      }

      await deleteParts(key) // leftovers of an earlier attempt that died midway
      const reader = res.body.getReader()
      let chunks: Uint8Array[] = []
      let buffered = 0
      let parts = 0
      let received = 0
      let lastReportedPct = -1
      const flush = async () => {
        if (!buffered) return
        await putPart(key, parts++, new Blob(chunks as BlobPart[], { type: contentType }))
        chunks = []
        buffered = 0
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.length
        // A single read can be bigger than a part (fast/local connections), so split it to keep parts bounded.
        for (let rest = value; rest.length; ) {
          const piece = rest.subarray(0, PART_BYTES - buffered)
          chunks.push(piece)
          buffered += piece.length
          rest = rest.subarray(piece.length)
          if (buffered >= PART_BYTES) await flush()
        }
        if (totalBytes > 0) {
          const pct = Math.min(99, Math.round((received / totalBytes) * 100)) // 100 only once actually saved
          if (pct !== lastReportedPct) {
            lastReportedPct = pct
            set((state) => ({ progress: { ...state.progress, [key]: pct } }))
          }
        }
      }

      await flush()
      await putDownload({ key, profileId, kind, id, name, image, seriesId, sizeBytes: received, downloadedAt: Date.now(), parts })

      set((state) => {
        const nextProgress = { ...state.progress }
        delete nextProgress[key]
        const meta: DownloadMeta = { key, profileId, kind, id, name, image, seriesId, sizeBytes: received, downloadedAt: Date.now() }
        const existing = (state.items[profileId] ?? EMPTY).filter((d) => d.key !== key)
        return { progress: nextProgress, items: { ...state.items, [profileId]: [meta, ...existing] } }
      })
    } catch (err) {
      // A full disk shows up as a QuotaExceededError while writing a piece, not up front.
      if (err instanceof DOMException && err.name === 'QuotaExceededError') failure = 'Sem espaço no aparelho para este vídeo'
      await deleteParts(key).catch(() => {})
      set((state) => {
        const nextProgress = { ...state.progress }
        delete nextProgress[key]
        return { progress: nextProgress, failed: { ...state.failed, [key]: failure } }
      })
    }
  },
}))

export function useDownloadsFor(profileId: string): DownloadMeta[] {
  return useDownloadsStore((s) => s.items[profileId] ?? EMPTY)
}

export function isDownloaded(profileId: string, kind: 'movie' | 'series', id: string, items: DownloadMeta[]): boolean {
  const key = `${profileId}:${kind}-${id}`
  return items.some((d) => d.key === key)
}

export { getDownload }
