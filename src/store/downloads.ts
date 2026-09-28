import { create } from 'zustand'
import { deleteDownload, type DownloadMeta, getDownload, listDownloadMeta, putDownload } from '../lib/offlineStore'
import type { ProviderClient } from '../lib/provider'

interface DownloadsState {
  // Metadata mirror of IndexedDB, per profile — the Blobs themselves never touch this store (or
  // localStorage): they're read from IndexedDB only at the moment playback actually needs them.
  items: Record<string, DownloadMeta[]>
  // 0–100 while a download is in flight; absent once it's done (moved into `items`) or failed.
  progress: Record<string, number>
  failed: Record<string, boolean>
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
}

const EMPTY: DownloadMeta[] = []

export const useDownloadsStore = create<DownloadsState>()((set, get) => ({
  items: {},
  progress: {},
  failed: {},
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
    set((state) => ({ progress: { ...state.progress, [key]: 0 }, failed: { ...state.failed, [key]: false } }))

    try {
      const res = await fetch(client.streamUrl(kind, id, ext))
      if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`)
      const totalBytes = Number(res.headers.get('content-length')) || 0
      const contentType = res.headers.get('content-type') || 'video/mp4'

      const reader = res.body.getReader()
      const chunks: Uint8Array[] = []
      let received = 0
      let lastReportedPct = -1
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        if (totalBytes > 0) {
          const pct = Math.min(99, Math.round((received / totalBytes) * 100)) // 100 only once actually saved
          if (pct !== lastReportedPct) {
            lastReportedPct = pct
            set((state) => ({ progress: { ...state.progress, [key]: pct } }))
          }
        }
      }

      const blob = new Blob(chunks as BlobPart[], { type: contentType })
      await putDownload({ key, profileId, kind, id, name, image, seriesId, sizeBytes: blob.size, downloadedAt: Date.now(), blob })

      set((state) => {
        const nextProgress = { ...state.progress }
        delete nextProgress[key]
        const meta: DownloadMeta = { key, profileId, kind, id, name, image, seriesId, sizeBytes: blob.size, downloadedAt: Date.now() }
        const existing = (state.items[profileId] ?? EMPTY).filter((d) => d.key !== key)
        return { progress: nextProgress, items: { ...state.items, [profileId]: [meta, ...existing] } }
      })
    } catch {
      set((state) => {
        const nextProgress = { ...state.progress }
        delete nextProgress[key]
        return { progress: nextProgress, failed: { ...state.failed, [key]: true } }
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
