/** Shared "one screen is loading" indicator: a small blue spinner, no words on screen (text is for screen
 * readers). Replaces the bare "Carregando..." strings that looked like a stuck page. */
export default function PageLoading({ label = 'Carregando', className = 'pt-32' }: { label?: string; className?: string }) {
  return (
    <div role="status" className={`flex justify-center ${className}`}>
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/10 border-t-brand-500" />
      <span className="sr-only">{label}</span>
    </div>
  )
}
