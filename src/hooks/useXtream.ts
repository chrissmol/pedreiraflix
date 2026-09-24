import { useMemo } from 'react'
import { XtreamClient } from '../lib/xtream'
import { useAuthStore } from '../store/auth'

export function useXtream(): XtreamClient | null {
  const credentials = useAuthStore((s) => s.credentials)
  return useMemo(() => (credentials ? new XtreamClient(credentials) : null), [credentials])
}
