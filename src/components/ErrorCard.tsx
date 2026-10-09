import { AlertTriangle, RefreshCw } from './icons'

/** Shared error state: a calm card with one obvious way out, instead of loose red text. */
export default function ErrorCard({ message, onRetry, className = '' }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={`mx-4 flex flex-col items-center gap-3 rounded-2xl border border-outline-soft bg-surface-low px-6 py-6 text-center sm:mx-10 ${className}`}>
      <AlertTriangle className="h-6 w-6 text-on-surface-muted" />
      <p className="max-w-md text-body-md text-on-surface-variant">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="brand-focus flex items-center gap-2 rounded-full bg-brand-fill px-5 py-2 text-label-md font-semibold text-white transition-transform hover:scale-105"
        >
          <RefreshCw className="h-4 w-4" /> Tentar de novo
        </button>
      )}
    </div>
  )
}
