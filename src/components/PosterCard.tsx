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
}

export default function PosterCard({ title, image, onClick, badge, subtitle, progressPct }: PosterCardProps) {
  return (
    <button
      onClick={onClick}
      className="brand-focus group relative aspect-2/3 w-32 shrink-0 overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-900 text-left shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out active:scale-[0.97] hover:z-10 hover:-translate-y-1.5 hover:scale-[1.08] hover:border-brand-400/50 hover:shadow-[0_0_0_1px_rgba(58,151,255,0.35),0_20px_45px_-12px_rgba(15,123,255,0.55)] focus-visible:z-10 focus-visible:-translate-y-1.5 focus-visible:scale-[1.08] sm:w-40"
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

      {/* Touch has no hover to reveal this on, so it's shown unconditionally there — mouse/keyboard still
          get the hover/focus reveal instead of a permanent overlay sitting on every poster. */}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/20 to-transparent p-2.5 opacity-100 transition-opacity duration-300 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-visible:opacity-100">
        <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/90 shadow-[0_0_16px_rgba(15,123,255,0.7)]">
          <Play className="h-3.5 w-3.5 text-white" />
        </div>
        <p className="line-clamp-2 text-xs font-semibold text-white">{title}</p>
        {subtitle && <p className="text-[10px] text-brand-200/90">{subtitle}</p>}
      </div>

      {badge && (
        <span className="absolute left-1.5 top-1.5 rounded-md border border-brand-400/30 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-brand-200 backdrop-blur-sm">
          {badge}
        </span>
      )}

      {!image && (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 p-2 text-center text-xs font-medium text-zinc-400">
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
