const store = new Map<string, unknown>()
const inFlight = new Map<string, Promise<unknown>>()

// Persisted to localStorage — not sessionStorage, which was the original choice here but doesn't survive
// closing the tab/app, and on a PWA/mobile install that's every single open. STALE_MS below is what keeps
// data from going stale across days, not the storage's own lifetime, so there was never a correctness
// reason to lose the cache on close; it was just needlessly repaying the full, heavily-throttled catalog
// fetch on every app launch. Categories rarely change minute to minute, so a short TTL is enough to make
// "Filmes"/"Séries"/"Ao vivo" feel instant on every visit after the first.
const TTL_MS = 15 * 60 * 1000
// A persisted entry past TTL_MS but still under this age is "stale but usable": returned immediately
// while a fresh copy loads in the background (see `cached` below), instead of showing a spinner again
// for data that's still probably fine. Past this age it's dropped entirely — old enough that showing it
// even briefly would be more likely to confuse than help (e.g. a whole day-old catalog).
const STALE_MS = 24 * 60 * 60 * 1000
const STORAGE_PREFIX = 'iptv-cache:v1:'

function readPersisted<T>(key: string): { value: T; isStale: boolean } | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return undefined
    const { value, ts } = JSON.parse(raw) as { value: T; ts: number }
    const age = Date.now() - ts
    if (age > STALE_MS) {
      localStorage.removeItem(STORAGE_PREFIX + key)
      return undefined
    }
    return { value, isStale: age > TTL_MS }
  } catch {
    return undefined
  }
}

function writePersisted<T>(key: string, value: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ value, ts: Date.now() }))
  } catch {
    // Private browsing, quota exceeded, or storage disabled — the in-memory cache alone still works
    // for the rest of this page's lifetime, it just won't survive a reload.
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

  const persisted = readPersisted<T>(key)
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
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k)
    }
  } catch {
    // Storage inaccessible — nothing persisted to clear anyway.
  }
}
