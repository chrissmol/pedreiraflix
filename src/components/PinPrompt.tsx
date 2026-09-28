import { useRef, useState } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { Lock } from './icons'
import type { Profile } from '../store/profiles'

interface PinPromptProps {
  profile: Profile
  onSuccess: () => void
  onCancel: () => void
}

/** A 4-digit PIN gate for entering a locked profile. Household-level friction (like Netflix's profile
 * lock), not real account security — the PIN itself lives in localStorage alongside everything else. */
export default function PinPrompt({ profile, onSuccess, onCancel }: PinPromptProps) {
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogA11y(dialogRef, true, onCancel)

  function handleChange(next: string) {
    const digits = next.replace(/\D/g, '').slice(0, 4)
    setValue(digits)
    setWrong(false)
    if (digits.length === 4) {
      if (digits === profile.pin) onSuccess()
      else {
        setWrong(true)
        setValue('')
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`PIN do perfil ${profile.name}`}
        onClick={(e) => e.stopPropagation()}
        className="glass-panel glow-border w-full max-w-xs rounded-2xl p-6 text-center"
      >
        <span
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white"
          style={{ background: profile.color }}
        >
          {profile.name[0]?.toUpperCase()}
        </span>
        <p className="mb-1 text-sm font-semibold text-white">{profile.name}</p>
        <p className="mb-4 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
          <Lock className="h-3.5 w-3.5" /> Digite o PIN de 4 dígitos
        </p>
        <input
          autoFocus
          inputMode="numeric"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          maxLength={4}
          aria-label="PIN"
          className={`brand-focus w-full rounded-xl border bg-zinc-900/70 px-3 py-3 text-center text-2xl tracking-[0.5em] text-white ${
            wrong ? 'border-rose-500/60' : 'border-zinc-800'
          }`}
        />
        {wrong && <p className="mt-2 text-xs text-rose-400">PIN incorreto</p>}
        <button onClick={onCancel} className="mt-4 text-xs text-zinc-500 hover:text-white">
          Cancelar
        </button>
      </div>
    </div>
  )
}
