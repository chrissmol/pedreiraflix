import { useEffect, useState } from 'react'
import type { EpgProgram } from '../types'
import { useXtream } from './useXtream'

export function useShortEpg(streamId: number | null) {
  const client = useXtream()
  const [programs, setPrograms] = useState<EpgProgram[]>([])

  useEffect(() => {
    if (!client || !streamId) {
      setPrograms([])
      return
    }
    let cancelled = false
    client
      .getShortEpg(streamId, 2)
      .then((data) => {
        if (!cancelled) setPrograms(data)
      })
      .catch(() => {
        if (!cancelled) setPrograms([])
      })
    return () => {
      cancelled = true
    }
  }, [client, streamId])

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
