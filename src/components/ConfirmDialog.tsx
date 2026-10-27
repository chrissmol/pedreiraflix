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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Confirmar"
        onClick={(e) => e.stopPropagation()}
        className="card-panel anim-pop w-full max-w-sm p-6 text-center sm:p-8"
      >
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-live/15 text-live">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <p className="mb-6 text-body-lg text-white">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="btn-secondary flex-1"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="btn-primary flex-1 bg-live shadow-none hover:bg-live/85 sm:px-6"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
