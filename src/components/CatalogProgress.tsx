import type { CategoryGroup } from '../hooks/useCatalog'

interface CatalogProgressProps {
  groups: CategoryGroup<unknown>[]
  label: string
}

/** Honest loading indicator: the percentage reflects categories that have actually
 * finished fetching (success or error), not a fake/animated estimate. */
export default function CatalogProgress({ groups, label }: CatalogProgressProps) {
  const total = groups.length
  const loaded = groups.filter((g) => !g.loading).length
  if (total === 0 || loaded >= total) return null

  const pct = Math.round((loaded / total) * 100)

  return (
    <div className="mx-4 mb-6 flex items-center gap-3 rounded-2xl border border-outline-soft bg-surface-low px-4 py-3 text-body-sm text-on-surface-variant sm:mx-10">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 tabular-nums">
        {label}: {loaded}/{total} categorias ({pct}%)
      </span>
    </div>
  )
}
