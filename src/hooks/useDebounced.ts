import { useEffect, useState } from 'react'

/** O valor so muda depois de `ms` sem mudar: a busca espera uma pausa na digitacao em vez de varrer o catalogo a cada letra. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}
