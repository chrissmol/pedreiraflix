import { useState } from 'react'
import { Lock } from './icons'
import { useAppLockStore } from '../store/appLock'

/** Full-screen PIN gate for the whole app, independent of any per-profile PIN. Asked again on every
 * reload (the unlock is in-memory only), like a phone lock screen. */
export default function AppLockGate() {
  const pin = useAppLockStore((s) => s.pin)
  const unlocked = useAppLockStore((s) => s.unlocked)
  const unlock = useAppLockStore((s) => s.unlock)
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)

  if (!pin || unlocked) return null

  function handleChange(next: string) {
    const digits = next.replace(/\D/g, '').slice(0, 4)
    setValue(digits)
    setWrong(false)
    if (digits.length === 4) {
      if (digits === pin) unlock()
      else {
        setWrong(true)
        setValue('')
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black p-4">
      <div className="glass-panel glow-border w-full max-w-xs rounded-2xl p-6 text-center">
        <Lock className="mx-auto mb-3 h-8 w-8 text-brand-400" />
        <p className="mb-4 text-sm font-semibold text-white">Digite o PIN do app</p>
        <input
          autoFocus
          inputMode="numeric"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          maxLength={4}
          aria-label="PIN do app"
          className={`brand-focus w-full rounded-xl border bg-surface-container px-3 py-3 text-center text-2xl tracking-[0.5em] text-white ${
            wrong ? 'border-rose-500/60' : 'border-outline-soft'
          }`}
        />
        {wrong && <p className="mt-2 text-xs text-rose-400">PIN incorreto</p>}
      </div>
    </div>
  )
}
