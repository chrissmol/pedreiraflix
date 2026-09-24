import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SubtitleSize = 'small' | 'medium' | 'large'
export type SubtitleBackground = 'none' | 'semi' | 'solid'

interface PlayerPrefsState {
  volume: number
  muted: boolean
  setVolumePrefs: (volume: number, muted: boolean) => void
  subtitleSize: SubtitleSize
  subtitleBackground: SubtitleBackground
  setSubtitleSize: (size: SubtitleSize) => void
  setSubtitleBackground: (bg: SubtitleBackground) => void
}

export const usePlayerPrefs = create<PlayerPrefsState>()(
  persist(
    (set) => ({
      volume: 1,
      muted: false,
      setVolumePrefs: (volume, muted) => set({ volume, muted }),
      subtitleSize: 'medium',
      subtitleBackground: 'semi',
      setSubtitleSize: (subtitleSize) => set({ subtitleSize }),
      setSubtitleBackground: (subtitleBackground) => set({ subtitleBackground }),
    }),
    { name: 'iptv-player-prefs' },
  ),
)
