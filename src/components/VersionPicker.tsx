import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMovieCatalog, useSeriesCatalog } from '../hooks/useCatalog'
import { itemKey } from '../lib/search'
import { versionLabel } from '../lib/versions'

/** "Versoes": as outras vezes que o provedor cadastrou esta obra (dublado, legendado, 4K). Nas listas elas viram um
 * cartao so (lib/versions); aqui se escolhe qual abrir. Procura no catalogo todo, porque cada versao pode estar numa
 * categoria. So aparece com duas ou mais. */
export function MovieVersions({ id }: { id: number }) {
  const { groups } = useMovieCatalog()
  const all = useMemo(() => groups.flatMap((g) => g.items.flatMap((m) => m.versions ?? [m])), [groups])
  return <Versions items={all.map((m) => ({ id: m.streamId, name: m.name }))} id={id} path="/movies" />
}

export function SeriesVersions({ id }: { id: number }) {
  const { groups } = useSeriesCatalog()
  const all = useMemo(() => groups.flatMap((g) => g.items.flatMap((s) => s.versions ?? [s])), [groups])
  return <Versions items={all.map((s) => ({ id: s.seriesId, name: s.name }))} id={id} path="/series" />
}

function Versions({ items, id, path }: { items: { id: number; name: string }[]; id: number; path: string }) {
  const navigate = useNavigate()
  const versions = useMemo(() => {
    const self = items.find((i) => i.id === id)
    if (!self) return []
    const key = itemKey(self)
    const seen = new Set<number>()
    return items.filter((i) => itemKey(i) === key && !seen.has(i.id) && seen.add(i.id))
  }, [items, id])
  if (versions.length < 2) return null
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Versões">
      <span className="text-label-md text-on-surface-variant">Versões</span>
      {versions.map((v, i) => (
        <button
          key={v.id}
          type="button"
          aria-pressed={v.id === id}
          onClick={() => v.id !== id && navigate(`${path}/${v.id}`, { replace: true })}
          className={`btn-secondary h-10 px-4 text-body-sm sm:px-4 ${v.id === id ? 'border-brand-500/60 text-brand-300' : ''}`}
        >
          {versionLabel(v.name, i)}
        </button>
      ))}
    </div>
  )
}
