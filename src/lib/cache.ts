const store = new Map<string, unknown>()
const inFlight = new Map<string, Promise<unknown>>()

// Persisted to IndexedDB — not localStorage, which was the previous choice here but is documented
// elsewhere in this codebase (offlineStore.ts) as one of the storage kinds iOS evicts under pressure for
// an installed home-screen PWA, without warning, once the app has been closed/killed for a while.
// IndexedDB isn't immune to that same eviction risk on iOS either, but it's the storage the platform
// actually intends for real persistence (localStorage was only ever a quick synchronous convenience), so
// it's the next lever worth pulling for "the catalog always reloads from scratch after not using the app
// for a bit" — a real, reported symptom that matches iOS killing a backgrounded PWA and, this codebase's
// own case, then not honoring the localStorage `navigator.storage.persist()` request. STALE_MS below is
// what keeps data from going stale across days, not the storage's own lifetime, so there's still no
// correctness reason to lose the cache on close; the goal is the same as before, just on sturdier ground.
const TTL_MS = 15 * 60 * 1000
// A persisted entry past TTL_MS but still under this age is "stale but usable": returned immediately
// while a fresh copy loads in the background (see `cached` below), instead of showing a spinner again
// for data that's still probably fine. Past this age it's dropped entirely — old enough that showing it
// even briefly would be more likely to confuse than help (e.g. a whole day-old catalog).
const STALE_MS = 24 * 60 * 60 * 1000

const DB_NAME = 'pedreiraflix-cache'
const DB_VERSION = 1
const OBJECT_STORE = 'entries'

interface PersistedEntry<T> {
  key: string
  value: T
  ts: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(OBJECT_STORE)) req.result.createObjectStore(OBJECT_STORE, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OBJECT_STORE, mode)
    const request = fn(tx.objectStore(OBJECT_STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

async function readPersisted<T>(key: string): Promise<{ value: T; isStale: boolean } | undefined> {
  try {
    const entry = await withStore<PersistedEntry<T> | undefined>('readonly', (s) => s.get(key))
    if (!entry) return undefined
    const age = Date.now() - entry.ts
    if (age > STALE_MS) {
      withStore('readwrite', (s) => s.delete(key)).catch(() => {})
      return undefined
    }
    return { value: entry.value, isStale: age > TTL_MS }
  } catch {
    // IndexedDB unavailable (private browsing on some browsers, disabled, etc.) — the in-memory cache
    // alone still works for the rest of this page's lifetime, it just won't survive a reload.
    return undefined
  }
}

async function writePersisted<T>(key: string, value: T): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.put({ key, value, ts: Date.now() } satisfies PersistedEntry<T>))
  } catch {
    // Same as above — degrade to in-memory only.
  }
}

function refresh<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const promise = loader()
    .then((result) => {
      store.set(key, result)
      writePersisted(key, result)
      inFlight.delete(key)
      return result
    })
    .catch((err) => {
      inFlight.delete(key)
      throw err
    })
  inFlight.set(key, promise)
  return promise
}

/** Stale-while-revalidate: a persisted entry older than TTL_MS but younger than STALE_MS is handed back
 * immediately (so a returning visit never blocks on a refetch) while a fresh copy loads in the
 * background and silently replaces the in-memory/persisted entry. This call's own caller still gets the
 * stale value — there's no subscriber list to push an update to an already-rendered page — but the next
 * `cached()` call for this key (next remount, next visit to the tab) picks up the refreshed data instead
 * of repeating the wait. */
export async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (store.has(key)) return store.get(key) as T
  if (inFlight.has(key)) return inFlight.get(key) as Promise<T>

  const persisted = await readPersisted<T>(key)
  if (persisted !== undefined) {
    store.set(key, persisted.value)
    if (persisted.isStale) refresh(key, loader).catch(() => {})
    return persisted.value
  }

  return refresh(key, loader)
}

export function clearCache() {
  store.clear()
  inFlight.clear()
  withStore('readwrite', (s) => s.clear()).catch(() => {})
}

/** The "limpar cache" button's actual job: this catalog cache plus the service worker's own app-shell
 * cache (sw.js's `pedreiraflix-v*` CacheStorage entries) — the same two places an iPhone's Ajustes >
 * Safari > Limpar Histórico e Dados would touch for this app, done from inside it instead. Doesn't touch
 * login/profiles/favorites/downloads (those are real user data, not cache) — a fresh reload right after
 * is what actually makes the cleared state visible, since the page currently in memory still holds the
 * old catalog until then. */
export async function clearAllCaches(): Promise<void> {
  store.clear()
  inFlight.clear()
  await withStore('readwrite', (s) => s.clear()).catch(() => {})
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  }
}
