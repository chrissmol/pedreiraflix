import { useCatalogProgress } from '../store/catalogProgress'

const R = 14
const C = 2 * Math.PI * R

/** Small blue ring beside the search box. Fades in only after a beat (a fast, cached load never flashes
 * it), always shows at least a sliver so it reads as "working" even before the first category lands, and
 * never shows numbers or category names — the user only needs to know "more is coming". */
export default function LoadingRing() {
  const fraction = useCatalogProgress((s) => s.fraction)
  if (fraction == null) return null
  const shown = Math.max(0.08, fraction)
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className="loading-ring h-6 w-6 shrink-0 -rotate-90"
    >
      <circle cx="16" cy="16" r={R} fill="none" strokeWidth="3" className="stroke-white/10" />
      <circle
        cx="16"
        cy="16"
        r={R}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-brand-500 transition-[stroke-dashoffset] duration-500 ease-out"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - shown)}
      />
    </svg>
  )
}
