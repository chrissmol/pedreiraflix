import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface WatchedItem {
  kind: 'movie' | 'series' | 'live'
  /** Filme e canal: o proprio id; serie: o id da serie (todos os episodios somam juntos). */
  id: number
  name: string
  image: string | null
  seconds: number
}

/** Tempo assistido por perfil e mes ("perfil:2026-10"), por titulo — a base da Retrospectiva. Fica so neste aparelho. */
interface WatchStatsState {
  months: Record<string, Record<string, WatchedItem>>
}

export const useWatchStats = create<WatchStatsState>()(persist(() => ({ months: {} }), { name: 'iptv-retrospectiva', version: 1 }))

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export function addWatchTime(profileId: string, item: Omit<WatchedItem, 'seconds'>, seconds: number, when = new Date()) {
  const key = `${profileId}:${monthKey(when)}`
  const itemKey = `${item.kind}-${item.id}`
  useWatchStats.setState((s) => {
    const month = s.months[key] ?? {}
    const prev = month[itemKey]
    return { months: { ...s.months, [key]: { ...month, [itemKey]: { ...item, image: item.image ?? prev?.image ?? null, seconds: (prev?.seconds ?? 0) + seconds } } } }
  })
}

const TICK_S = 10

/** Conta o tempo em que o video da tela esta de fato tocando (pausado, carregando ou parado nao conta), de 10 em 10 s. */
export function useWatchTime(profileId: string, item: Omit<WatchedItem, 'seconds'> | null) {
  const itemRef = useRef(item)
  useEffect(() => {
    itemRef.current = item
  })
  useEffect(() => {
    const timer = setInterval(() => {
      const video = document.querySelector('video')
      const current = itemRef.current
      if (!current || !video || video.paused || video.ended || video.readyState < 3) return
      addWatchTime(profileId, current, TICK_S)
    }, TICK_S * 1000)
    return () => clearInterval(timer)
  }, [profileId])
}
