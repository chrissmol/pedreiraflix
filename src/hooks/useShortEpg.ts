import { useEffect, useState } from 'react'
import { cached } from '../lib/cache'
import type { EpgProgram } from '../types'
import { useXtream } from './useXtream'

export function useShortEpg(streamId: number | null) {
  const client = useXtream()
  const [epg, setEpg] = useState<{ streamId: number; programs: EpgProgram[] } | null>(null)

  useEffect(() => {
    if (!client || !streamId) return
    let cancelled = false
    // Mesma chave do LiveChannelCard: a lista de canais ja deixou o EPG no cache.
    cached(`epg-now:${streamId}`, () => client.getShortEpg(streamId, 2))
      .then((data) => {
        // O cache pode devolver um valor de ate 24h (atualiza em segundo plano): descarta o que ja terminou.
        const now = Date.now()
        const live = data.filter((p) => new Date(p.end.replace(' ', 'T')).getTime() > now)
        if (!cancelled) setEpg({ streamId, programs: live })
      })
      .catch(() => {
        if (!cancelled) setEpg({ streamId, programs: [] })
      })
    return () => {
      cancelled = true
    }
  }, [client, streamId])

  const programs = client && streamId && epg?.streamId === streamId ? epg.programs : []
  return {
    current: programs[0] ?? null,
    next: programs[1] ?? null,
  }
}

export function formatEpgTime(isoLike: string): string {
  const date = new Date(isoLike.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
