import type { M3uEntry } from './m3u'

// Playlist M3U grande passa dos ~5 MB do localStorage (a gravacao falhava calada e a conta nao voltava
// apos fechar o app). Aqui ela fica no IndexedDB, por conta; os stores so guardam o que cabe no localStorage.
const DB_NAME = 'pedreiraflix-m3u'
const STORE = 'playlists'

/** Contas cuja playlist ja esta confirmada no IndexedDB: so essas saem do localStorage (partialize dos stores). */
export const inIdb = new Set<string>()

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => {
      db.close()
      resolve(req.result)
    }
    tx.onerror = tx.onabort = () => reject(tx.error)
  })
}

/** Grava a playlist; true so se o IndexedDB confirmou (sem IndexedDB, ela continua no localStorage como antes). */
export async function saveEntries(id: string, entries: M3uEntry[]): Promise<boolean> {
  try {
    await run('readwrite', (s) => s.put(entries, id))
    inIdb.add(id)
    return true
  } catch {
    return false
  }
}

export async function loadEntries(id: string): Promise<M3uEntry[] | null> {
  try {
    const found = await run<M3uEntry[] | undefined>('readonly', (s) => s.get(id))
    if (!found) return null
    inIdb.add(id)
    return found
  } catch {
    return null
  }
}

export function deleteEntries(id: string): void {
  inIdb.delete(id)
  run('readwrite', (s) => s.delete(id)).catch(() => {})
}
