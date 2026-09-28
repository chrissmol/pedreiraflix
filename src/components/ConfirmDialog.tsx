import { useRef } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { AlertTriangle } from './icons'

interface ConfirmDialogProps {
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/** Replaces `window.confirm()` for destructive actions (delete profile, delete download) — same
 * yes/no shape, but styled like the rest of the app instead of the browser's own native popup, and with
 * the same Esc/focus-trap semantics as every other dialog here (see useDialogA11y). */
export default function ConfirmDialog({ message, confirmLabel = 'Excluir', onConfirm, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogA11y(dialogRef, true, onCancel)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Confirmar"
        onClick={(e) => e.stopPropagation()}
        className="glass-panel glow-border w-full max-w-sm rounded-2xl p-6 text-center"
      >
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-400">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <p className="mb-5 text-sm text-zinc-200">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/70 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-rose-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-rose-500"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
