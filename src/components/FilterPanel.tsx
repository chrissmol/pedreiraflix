import { useRef, useState, type ReactNode } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { Sliders, X } from './icons'

export interface ActiveFilter {
  key: string
  label: string
  clear: () => void
}

interface FilterPanelProps {
  active: ActiveFilter[]
  children: ReactNode
}

const chipClass = (on: boolean) =>
  `shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-label-md transition-colors ${
    on
      ? 'bg-brand-fill text-white shadow-[0_0_20px_-4px_rgba(15,123,255,0.6)]'
      : 'bg-surface-container text-on-surface-variant hover:bg-surface-high hover:text-white'
  }`

/** Uma linha de opções onde só uma vale (ordem, nota, gênero…). */
export function ChipGroup<T extends string>({ title, value, options, onChange }: {
  title: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <FilterSection title={title}>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)} className={chipClass(o.value === value)}>
            {o.label}
          </button>
        ))}
      </div>
    </FilterSection>
  )
}

export function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="menu-label px-0">{title}</h3>
      {children}
    </section>
  )
}

/** Filtros do catálogo atrás de um único botão "Filtros": a tela fica só com o título, o botão e uma pílula
 * por filtro ligado (para limpar com um toque). O painel é uma gaveta de baixo no celular e um cartão
 * centralizado do `sm` para cima; as setas + OK da TV ficam presas dentro dele (ver moveFocusTv). */
export default function FilterPanel({ active, children }: FilterPanelProps) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  // Uma lista de opções aberta (Ano, Categoria) fecha primeiro com o Esc/Voltar; so a seguinte fecha o painel.
  const close = () => {
    if (!document.querySelector('[role="listbox"]')) setOpen(false)
  }
  useDialogA11y(panelRef, open, close)

  return (
    <>
      <button onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className="btn-secondary h-11">
        <Sliders className="h-4 w-4" />
        Filtros
        {active.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-fill px-1 text-label-badge font-bold text-white">
            {active.length}
          </span>
        )}
      </button>
      {active.map((f) => (
        <button key={f.key} onClick={f.clear} aria-label={`Remover filtro ${f.label}`} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-brand-500/15 px-4 text-label-md text-brand-300 hover:bg-brand-500/25">
          {f.label}
          <X className="h-3.5 w-3.5" />
        </button>
      ))}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => setOpen(false)}>
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Filtros"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if ((e.key === 'Backspace' || e.key === 'GoBack' || e.key === 'XF86Back') && !(e.target instanceof HTMLInputElement)) {
                e.preventDefault()
                close()
              }
            }}
            className="card-panel anim-pop max-h-[85vh] w-full overflow-y-auto rounded-b-none p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-2xl sm:rounded-b-3xl sm:p-7"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-headline-sm text-white">Filtros</h2>
              {active.length > 0 && (
                <button onClick={() => active.forEach((f) => f.clear())} className="text-label-md text-brand-300 hover:text-white">
                  Limpar tudo
                </button>
              )}
            </div>
            {children}
            <button onClick={() => setOpen(false)} className="btn-primary sticky bottom-0 w-full">
              Ver resultados
            </button>
          </div>
        </div>
      )}
    </>
  )
}
