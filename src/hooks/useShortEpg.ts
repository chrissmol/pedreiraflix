import { useEffect, useState } from 'react'
import type { EpgProgram } from '../types'
import { useXtream } from './useXtream'

export function useShortEpg(streamId: number | null) {
  const client = useXtream()
  const [epg, setEpg] = useState<{ streamId: number; programs: EpgProgram[] } | null>(null)

  useEffect(() => {
    if (!client || !streamId) return
    let cancelled = false
    client
      .getShortEpg(streamId, 2)
      .then((data) => {
        if (!cancelled) setEpg({ streamId, programs: data })
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
