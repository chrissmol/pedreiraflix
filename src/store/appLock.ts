import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppLockState {
  /** 4-digit PIN required to open the app at all, separate from any per-profile PIN. */
  pin?: string
  /** Not persisted: resets on every reload, so the PIN is asked again each time the app opens. */
  unlocked: boolean
  setPin: (pin: string | null) => void
  unlock: () => void
}

export const useAppLockStore = create<AppLockState>()(
  persist(
    (set) => ({
      pin: undefined,
      unlocked: false,
      setPin: (pin) => set({ pin: pin || undefined, unlocked: !pin }),
      unlock: () => set({ unlocked: true }),
    }),
    { name: 'iptv-app-lock', partialize: (s) => ({ pin: s.pin }) },
  ),
)
