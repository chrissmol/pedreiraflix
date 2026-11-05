import { STREAMINGS } from '../lib/streaming'

/** Atalhos por plataforma (Netflix, Globoplay...) acima das fileiras: um toque abre a grade daquela plataforma.
 * So aparecem as que tem titulo no catalogo. Botoes comuns: as setas + OK da TV ja chegam neles. */
export default function StreamingChips({ groups, active, onPick }: {
  groups: { category: { categoryId: string } }[]
  active: string | null
  onPick: (id: string | null) => void
}) {
  const present = STREAMINGS.filter((s) => groups.some((g) => g.category.categoryId === `s:${s.key}`))
  if (present.length === 0) return null
  return (
    <nav aria-label="Streaming" className="mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:px-10">
      {present.map((s) => {
        const id = `s:${s.key}`
        const on = active === id
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(on ? null : id)}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-label-md transition-colors ${on ? 'border-white bg-white/15 text-white' : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'}`}
          >
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            {s.name}
          </button>
        )
      })}
    </nav>
  )
}
