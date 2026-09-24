// IndexedDB-backed storage for offline downloads (the actual video Blob) — localStorage/sessionStorage
// cap out at a few MB and can't hold video at all; IndexedDB is the browser's only storage with enough
// headroom (varies by device/browser, typically hundreds of MB to several GB on desktop, much tighter
// and less reliable on iOS Safari, which can also evict PWA storage under pressure without warning).
// This file only talks to IndexedDB directly; store/downloads.ts is the reactive (metadata-only) layer
// components actually use.
const DB_NAME = 'pedreiraflix-offline'
const DB_VERSION = 1
const STORE = 'downloads'

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
  blob: Blob
}

export type DownloadMeta = Omit<DownloadRecord, 'blob'>

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = fn(tx.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function putDownload(record: DownloadRecord): Promise<void> {
  await withStore('readwrite', (store) => store.put(record))
}

export async function getDownload(key: string): Promise<DownloadRecord | undefined> {
  return withStore('readonly', (store) => store.get(key))
}

export async function deleteDownload(key: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(key))
}

export async function listDownloadMeta(profileId: string): Promise<DownloadMeta[]> {
  const all = await withStore<DownloadRecord[]>('readonly', (store) => store.getAll())
  return all.filter((r) => r.profileId === profileId).map(({ blob: _blob, ...meta }) => meta)
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
