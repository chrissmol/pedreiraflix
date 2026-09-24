const store = new Map<string, unknown>()
const inFlight = new Map<string, Promise<unknown>>()

export async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (store.has(key)) return store.get(key) as T
  if (inFlight.has(key)) return inFlight.get(key) as Promise<T>

  const promise = loader()
    .then((result) => {
      store.set(key, result)
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
}
