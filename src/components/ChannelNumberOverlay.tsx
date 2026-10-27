/** O numero sendo digitado no controle (canto de cima), ou o aviso de que o canal nao existe. */
export default function ChannelNumberOverlay({ typed, missing }: { typed: string; missing: string | null }) {
  if (!typed && !missing) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-6 top-6 z-[70] rounded-2xl bg-black/80 px-6 py-3 font-display text-headline-md tabular-nums text-white shadow-lg"
    >
      {typed ? `Canal ${typed}` : `Canal ${missing} não existe`}
    </div>
  )
}
