import { useState, type ReactNode } from 'react'
import { Sliders } from './icons'

interface FilterBarProps {
  /** How many filters are currently narrowing the list — shown as a badge so a collapsed bar never hides
   * the fact that the list is filtered. */
  active: number
  children: ReactNode
}

/** Catalog filters: inline from `sm` up (where there's room), behind a "Filtrar" toggle on phones. Three
 * or four always-open dropdowns ate most of the first screen there, pushing the actual posters below the
 * fold — every streaming app puts them one tap away instead. */
export default function FilterBar({ active, children }: FilterBarProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="btn-secondary h-11 sm:hidden"
      >
        <Sliders className="h-4 w-4" />
        Filtrar
        {active > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-xs font-bold text-white">
            {active}
          </span>
        )}
      </button>
      <div className={`${open ? 'flex' : 'hidden'} w-full flex-wrap items-center gap-3 sm:flex sm:w-auto sm:flex-1`}>
        {children}
      </div>
    </>
  )
}
