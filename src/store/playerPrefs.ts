import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PlayerPrefsState {
  volume: number
  muted: boolean
  setVolumePrefs: (volume: number, muted: boolean) => void
}

export const usePlayerPrefs = create<PlayerPrefsState>()(
  persist(
    (set) => ({
      volume: 1,
      muted: false,
      setVolumePrefs: (volume, muted) => set({ volume, muted }),
    }),
    { name: 'iptv-player-prefs' },
  ),
)
