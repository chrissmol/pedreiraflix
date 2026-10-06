import { Play } from './icons'

interface PosterCardProps {
  title: string
  image: string | null
  onClick: () => void
  badge?: string | null
  subtitle?: string | null
  /** 0–100. Renders a thin progress bar across the bottom of the poster, always visible (not just on
   * hover) — the same at-a-glance "how far in am I" cue Netflix shows in Continue Watching rows. */
  progressPct?: number | null
  /** True inside a CSS grid (PosterGrid), where the grid track itself sizes the card — the fixed
   * w-32/sm:w-40/md:w-44 used everywhere else is for a horizontal scroll row (Row.tsx), which has no
   * track to size against. */
  fill?: boolean
}

export default function PosterCard({ title, image, onClick, badge, subtitle, progressPct, fill }: PosterCardProps) {
  return (
    <button
      data-spatial
      onClick={onClick}
      // Apple-style hover: the card itself lifts and deepens its own (neutral) shadow — no colored
      // border/glow lighting up around it, unlike before.
      className={`brand-focus group relative aspect-2/3 overflow-hidden rounded-xl border border-outline-soft bg-surface-container text-left shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out active:scale-[0.97] hover:z-10 hover:-translate-y-1.5 hover:scale-[1.08] hover:border-outline-strong hover:shadow-[0_20px_45px_-12px_rgba(0,0,0,0.7)] focus-visible:z-10 focus-visible:-translate-y-1.5 focus-visible:scale-[1.08] ${
        fill ? 'w-full' : 'w-32 shrink-0 sm:w-40 md:w-44'
      }`}
    >
      {image ? (
        <img
          src={image}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover brightness-[0.92] transition-[filter,transform] duration-300 group-hover:scale-105 group-hover:brightness-100"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : null}

      {/* O titulo fica SEMPRE visivel, como o brand book mostra: so o botao de play e revelado no hover.
          Esconder informacao atras de hover ja foi corrigido tres vezes neste projeto. */}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/25 to-transparent p-2.5">
        <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/90 opacity-0 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.6)] transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100">
          <Play className="h-3.5 w-3.5 text-white" />
        </div>
        <p className="line-clamp-2 text-label-badge font-semibold text-white">{title}</p>
        {subtitle && <p className="text-label-badge text-on-surface-variant">{subtitle}</p>}
      </div>


      {badge && (
        <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-label-badge font-bold text-rating backdrop-blur-sm">
          {badge}
        </span>
      )}

      {!image && (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-high to-surface-container p-2 text-center text-label-badge text-on-surface-variant">
          {title}
        </div>
      )}

      {progressPct != null && progressPct > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-brand-400"
            style={{ width: `${Math.min(100, progressPct)}%` }}
          />
        </div>
      )}
    </button>
  )
}
