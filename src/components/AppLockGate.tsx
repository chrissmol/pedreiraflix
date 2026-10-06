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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface p-4">
      <div className="card-panel w-full max-w-xs p-6 text-center sm:p-8">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/15 text-brand-400"><Lock className="h-7 w-7" /></span>
        <p className="font-display mb-5 text-headline-sm text-white">Digite o PIN do app</p>
        <input
          autoFocus
          inputMode="numeric"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          maxLength={4}
          aria-label="PIN do app"
          className={`brand-focus h-14 w-full rounded-2xl border bg-surface-container px-3 text-center text-headline-md tracking-[0.5em] text-white ${
            wrong ? 'border-live/60' : 'border-outline-soft'
          }`}
        />
        {wrong && <p className="mt-2 text-body-sm text-live">PIN incorreto</p>}
      </div>
    </div>
  )
}
