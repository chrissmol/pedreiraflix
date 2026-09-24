const store = new Map<string, unknown>()
const inFlight = new Map<string, Promise<unknown>>()

// Persisted to sessionStorage (not localStorage: cleared when the tab/app closes, so it can never go
// stale across days) so that navigating between pages — or just reloading — doesn't repay the full,
// heavily-throttled catalog fetch every single time. Categories rarely change minute to minute, so a
// short TTL is enough to make "Filmes"/"Séries"/"Ao vivo" feel instant on every visit after the first.
const TTL_MS = 15 * 60 * 1000
const STORAGE_PREFIX = 'iptv-cache:v1:'

function readPersisted<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return undefined
    const { value, ts } = JSON.parse(raw) as { value: T; ts: number }
    if (Date.now() - ts > TTL_MS) {
      sessionStorage.removeItem(STORAGE_PREFIX + key)
      return undefined
    }
    return value
  } catch {
    return undefined
  }
}

function writePersisted<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ value, ts: Date.now() }))
  } catch {
    // Private browsing, quota exceeded, or storage disabled — the in-memory cache alone still works
    // for the rest of this page's lifetime, it just won't survive a reload.
  }
}

export async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (store.has(key)) return store.get(key) as T
  if (inFlight.has(key)) return inFlight.get(key) as Promise<T>

  const persisted = readPersisted<T>(key)
  if (persisted !== undefined) {
    store.set(key, persisted)
    return persisted
  }

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

export function clearCache() {
  store.clear()
  inFlight.clear()
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(k)
    }
  } catch {
    // Storage inaccessible — nothing persisted to clear anyway.
  }
}
