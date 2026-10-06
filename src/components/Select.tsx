import { useRef, useState } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { ChevronDown } from './icons'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** For an aria-label when there's no visible <label> next to it (every current caller). */
  label: string
  className?: string
}

// Every dropdown in the app used to be a plain <select>, which renders with the OS/browser's own popup
// styling — the one place in the whole dark/glass visual language where the chrome of the browser shows
// through instead of the app's own look, on every platform. This is a same-behavior, same-accessibility-
// tree (role="listbox"/"option", Esc, arrow-adjacent Tab trap via useDialogA11y) drop-in replacement.
export default function Select({ value, onChange, options, label, className }: SelectProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)

  useDialogA11y(panelRef, open, () => setOpen(false))

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={(e) => {
          if (!wrapRef.current?.contains(e.relatedTarget as Node)) setOpen(false)
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="brand-focus flex w-full items-center justify-between gap-2 rounded-xl border border-outline-soft bg-surface-container px-3.5 py-2 text-sm text-white transition-colors hover:border-brand-500/40"
      >
        <span className="truncate">{current?.label ?? label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-on-surface-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          ref={panelRef}
          role="listbox"
          aria-label={label}
          className="glass-panel absolute right-0 z-30 mt-1.5 max-h-72 w-full min-w-[10rem] overflow-y-auto rounded-xl p-1 text-sm shadow-2xl"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/10 ${
                o.value === value ? 'text-brand-300' : 'text-white'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
