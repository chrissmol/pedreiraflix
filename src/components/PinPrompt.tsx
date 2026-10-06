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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`PIN do perfil ${profile.name}`}
        onClick={(e) => e.stopPropagation()}
        className="card-panel w-full max-w-xs p-6 text-center sm:p-8"
      >
        <span
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-headline-md text-white"
          style={{ background: profile.color }}
        >
          {profile.name[0]?.toUpperCase()}
        </span>
        <p className="font-display mb-1 text-headline-sm text-white">{profile.name}</p>
        <p className="mb-5 flex items-center justify-center gap-1.5 text-body-sm text-on-surface-variant">
          <Lock className="h-3.5 w-3.5" /> Digite o PIN de 4 dígitos
        </p>
        <input
          autoFocus
          inputMode="numeric"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          maxLength={4}
          aria-label="PIN"
          className={`brand-focus h-14 w-full rounded-2xl border bg-surface-container px-3 text-center text-headline-md tracking-[0.5em] text-white ${
            wrong ? 'border-live/60' : 'border-outline-soft'
          }`}
        />
        {wrong && <p className="mt-2 text-body-sm text-live">PIN incorreto</p>}
        <button onClick={onCancel} className="mt-4 text-label-md text-on-surface-variant hover:text-white">
          Cancelar
        </button>
      </div>
    </div>
  )
}
