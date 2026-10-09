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
import { nativeDownloads } from '../lib/nativeDownloads'
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
  /** Acompanha um download do Android ate terminar (progresso no botao). */
  watchNative: (profileId: string, key: string, nativeId: number) => Promise<void>
}

const stopRequested = new Set<string>()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// Downloads do Android sendo acompanhados agora (para nao abrir dois acompanhamentos do mesmo).
const watchingNative = new Set<string>()

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
    // Os que ainda baixam no Android (app foi fechado no meio) nao aparecem como baixados: voltam a ser
    // acompanhados, com o progresso no botao.
    for (const d of meta) if (d.pending && d.nativeId != null && !watchingNative.has(d.key)) void get().watchNative(profileId, d.key, d.nativeId)
    set((state) => ({ items: { ...state.items, [profileId]: meta.filter((d) => !d.pending) } }))
  },
  watchNative: async (profileId, key, nativeId) => {
    if (!nativeDownloads || watchingNative.has(key)) return
    watchingNative.add(key)
    try {
      while (true) {
        const [st] = (await nativeDownloads.status({ ids: [nativeId] })).downloads
        if (st?.state === 'running') {
          const pct = st.total && st.total > 0 ? Math.min(99, Math.round(((st.bytes ?? 0) / st.total) * 100)) : 0
          set((state) => ({ progress: { ...state.progress, [key]: pct } }))
          await sleep(1500)
          continue
        }
        const record = await getDownload(key)
        set((state) => {
          const progress = { ...state.progress }
          delete progress[key]
          return { progress }
        })
        if (st?.state === 'done' && record) {
          const done = { ...record, pending: false, sizeBytes: st.total || st.bytes || 0, downloadedAt: Date.now() }
          await putDownload(done)
          const { blob: _b, parts: _p, ...meta } = done
          set((state) => ({ items: { ...state.items, [profileId]: [meta, ...(state.items[profileId] ?? EMPTY).filter((d) => d.key !== key)] } }))
        } else {
          // Falhou ou o Android perdeu o download (ex.: apagado pela notificacao): some o registro.
          await deleteDownload(key)
          set((state) => ({ failed: { ...state.failed, [key]: 'Falhou — toque para tentar de novo' } }))
        }
        return
      }
    } finally {
      watchingNative.delete(key)
    }
  },
  remove: async (profileId, key) => {
    const record = await getDownload(key)
    if (record?.nativeId != null) await nativeDownloads?.remove({ id: record.nativeId }).catch(() => {})
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
    // No APK quem baixa e o Android: continua com o app fechado e mostra notificacao. Aqui so registra e
    // acompanha ate terminar (a fila da temporada espera, um episodio por vez, por causa do limite de telas).
    if (nativeDownloads) {
      try {
        const url = new URL(client.streamUrl(kind, id, ext), location.href).href
        const { id: nativeId } = await nativeDownloads.start({ url, fileName: `${kind}-${id}-${Date.now()}.${ext}`, title: name })
        await putDownload({ key, profileId, kind, id, name, image, seriesId, sizeBytes: 0, downloadedAt: Date.now(), nativeId, pending: true })
        await get().watchNative(profileId, key, nativeId)
      } catch {
        set((state) => {
          const progress = { ...state.progress }
          delete progress[key]
          return { progress, failed: { ...state.failed, [key]: failure } }
        })
      }
      return
    }
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
