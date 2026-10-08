import { useEffect } from 'react'
import type { CategoryGroup } from '../hooks/useCatalog'
import { useCatalogProgress } from '../store/catalogProgress'

interface CatalogProgressProps {
  groups: CategoryGroup<unknown>[]
  label: string
}

/** Renders nothing visible: the progress lives in the header ring (`LoadingRing`), so a page full of
 * "still loading" bars never competes with the content. The text stays for screen readers. */
export default function CatalogProgress({ groups, label }: CatalogProgressProps) {
  const total = groups.length
  const loaded = groups.filter((g) => !g.loading).length
  const busy = total > 0 && loaded < total

  useEffect(() => {
    useCatalogProgress.setState({ fraction: busy ? loaded / total : null })
  }, [busy, loaded, total])
  useEffect(() => () => useCatalogProgress.setState({ fraction: null }), [])

  if (!busy) return null
  return (
    <p role="status" className="sr-only">
      {label}: {loaded}/{total} categorias
    </p>
  )
}
