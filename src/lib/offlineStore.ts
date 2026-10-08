// IndexedDB-backed storage for offline downloads (the actual video Blob) — localStorage/sessionStorage
// cap out at a few MB and can't hold video at all; IndexedDB is the browser's only storage with enough
// headroom (varies by device/browser, typically hundreds of MB to several GB on desktop, much tighter
// and less reliable on iOS Safari, which can also evict PWA storage under pressure without warning).
// This file only talks to IndexedDB directly; store/downloads.ts is the reactive (metadata-only) layer
// components actually use.
const DB_NAME = 'pedreiraflix-offline'
const DB_VERSION = 2
const STORE = 'downloads'
// The video itself, in pieces of ~PART_BYTES written as they arrive, so a 2 GB movie never sits whole in
// RAM (that crashed the tab on iPhone). Keyed [downloadKey, index].
const PARTS = 'parts'
// Dev-only override (dead code in production, like CategoryRow's render counter) so e2e can force a small
// test video into many pieces and prove they come back in order.
export const PART_BYTES =
  (import.meta.env.DEV && (window as unknown as { __partBytes?: number }).__partBytes) || 8 * 1024 * 1024

export interface DownloadRecord {
  /** `${profileId}:${kind}-${id}` — same key shape used everywhere else for profile-scoped data. */
  key: string
  profileId: string
  kind: 'movie' | 'series'
  id: string
  name: string
  image: string | null
  seriesId?: number
  sizeBytes: number
  downloadedAt: number
  /** Downloads made before parts existed keep the whole video here. */
  blob?: Blob
  /** How many pieces live in the `parts` store (new downloads). */
  parts?: number
}

export type DownloadMeta = Omit<DownloadRecord, 'blob' | 'parts'>

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' })
      if (!req.result.objectStoreNames.contains(PARTS)) req.result.createObjectStore(PARTS)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>, name = STORE): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode)
    const request = fn(tx.objectStore(name))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function putDownload(record: DownloadRecord): Promise<void> {
  await withStore('readwrite', (store) => store.put(record))
}

export async function putPart(key: string, index: number, part: Blob): Promise<void> {
  await withStore('readwrite', (store) => store.put(part, [key, index]), PARTS)
}

export async function deleteParts(key: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(IDBKeyRange.bound([key, 0], [key, Infinity])), PARTS)
}

export async function getDownload(key: string): Promise<DownloadRecord | undefined> {
  return withStore('readonly', (store) => store.get(key))
}

/** The playable video. Gluing the stored pieces into one Blob doesn't read them into memory: IndexedDB
 * hands back disk-backed Blobs and the browser streams from them on demand. */
export async function getDownloadBlob(record: DownloadRecord): Promise<Blob> {
  if (record.blob) return record.blob
  const parts = await withStore<Blob[]>('readonly', (store) => store.getAll(IDBKeyRange.bound([record.key, 0], [record.key, Infinity])), PARTS)
  return new Blob(parts, { type: parts[0]?.type || 'video/mp4' })
}

export async function deleteDownload(key: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(key))
  await deleteParts(key)
}

export async function listDownloadMeta(profileId: string): Promise<DownloadMeta[]> {
  const all = await withStore<DownloadRecord[]>('readonly', (store) => store.getAll())
  return all.filter((r) => r.profileId === profileId).map(({ blob: _blob, parts: _parts, ...meta }) => meta)
}

/** Best-effort: how much storage is used/available. Not all browsers implement this, and the number is
 * an estimate (shared across the whole origin, not just our downloads) — used only to warn, never to hard-block. */
export async function estimateStorage(): Promise<{ usageBytes: number; quotaBytes: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate || estimate.usage == null || estimate.quota == null) return null
    return { usageBytes: estimate.usage, quotaBytes: estimate.quota }
  } catch {
    return null
  }
}
