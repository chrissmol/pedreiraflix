import { useMemo } from 'react'
import { M3uClient } from '../lib/m3u'
import type { ProviderClient } from '../lib/provider'
import { XtreamClient } from '../lib/xtream'
import { useAuthStore } from '../store/auth'

/** Builds the client for whatever provider the current session is signed into — Xtream or M3U — behind
 * the shared `ProviderClient` interface, so every catalog/player/downloads consumer stays provider-agnostic. */
export function useXtream(): ProviderClient | null {
  const credentials = useAuthStore((s) => s.credentials)
  const entries = useAuthStore((s) => s.entries)
  return useMemo(() => {
    if (!credentials) return null
    if (credentials.type === 'xtream') return new XtreamClient(credentials)
    return entries ? new M3uClient(entries) : null
  }, [credentials, entries])
}
