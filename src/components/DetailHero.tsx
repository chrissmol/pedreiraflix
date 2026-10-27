import { useState, type ReactNode } from 'react'
import { displayTitle } from '../lib/displayTitle'
import { Check } from './icons'

interface DetailHeroProps {
  title: string
  backdrop: string | null
  poster: string | null
  /** Selos curtos ao lado da nota: ano, duracao, "3 temporadas"... */
  chips: string[]
  /** Unica nota exibida (o Chris preferiu so o IMDb); sem ela, nenhuma nota aparece. */
  imdbRating?: string | null
  genre?: string | null
  plot?: string | null
  credits: { label: string; value: string | null }[]
  actions: ReactNode
  footnote?: ReactNode
  /** Selo de status antes da nota: "Assistido"/"Concluída" com ✓, ou "Novos episódios" quando a serie cresceu. */
  status?: { label: string; done: boolean } | null
}

/** Topo das paginas de filme e de serie no layout do Stitch: fundo em tela cheia, selos, genero em
 * destaque, titulo grande, sinopse, creditos, botoes em pilula e o poster a direita no desktop. */
export default function DetailHero({ title: rawTitle, backdrop, poster, imdbRating, chips, genre, plot, credits, actions, footnote, status }: DetailHeroProps) {
  // Sem os enfeites do provedor ("[L]", ano repetido), como no destaque e nos posteres.
  const title = displayTitle(rawTitle)
  const shownCredits = credits.filter((c) => c.value)
  const [plotOpen, setPlotOpen] = useState(false)
  // shortcut: estima pelo tamanho em vez de medir o corte; troque por medicao se sobrar botao em sinopse curta.
  const longPlot = (plot?.length ?? 0) > 280
  return (
    <section className="relative overflow-hidden">
      {backdrop && <img src={backdrop} alt="" className="absolute inset-0 h-full max-h-[720px] w-full object-cover opacity-60" />}
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/80 to-surface/30" />
      <div className="absolute inset-0 bg-gradient-to-r from-surface/95 via-surface/60 to-transparent" />

      <div className="relative z-10 flex items-end gap-10 px-4 pb-10 pt-[calc(6rem+env(safe-area-inset-top))] sm:px-10 sm:pt-32">
        <div className="min-w-0 max-w-5xl flex-1">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {status && (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-label-badge font-semibold ${
                  status.done ? 'bg-black/70 text-done' : 'bg-white text-black'
                }`}
              >
                {status.done && <Check className="h-3.5 w-3.5" />}
                {status.label}
              </span>
            )}
            {imdbRating && (
              <span className="rounded-md bg-surface-high/80 px-2 py-1 text-label-badge text-white">
                <span className="font-extrabold text-rating">IMDb</span> {imdbRating}
              </span>
            )}
            {chips.map((chip) => (
              <span key={chip} className="rounded-md bg-surface-high/80 px-2 py-1 text-label-badge text-on-surface-variant">
                {chip}
              </span>
            ))}
          </div>
          {genre && <p className="mb-2 text-label-badge uppercase tracking-wider text-brand-400">{genre}</p>}
          <h1 className="font-display text-headline-lg text-white sm:text-display-hero">{title}</h1>
          {plot && (
            <p className={`mt-4 max-w-2xl text-body-md text-on-surface-variant sm:text-body-lg ${longPlot && !plotOpen ? 'line-clamp-4' : ''}`}>
              {plot}
            </p>
          )}
          {longPlot && (
            <button
              type="button"
              aria-expanded={plotOpen}
              onClick={() => setPlotOpen((o) => !o)}
              className="mt-1 min-h-11 text-label-md font-semibold text-white hover:text-brand-400"
            >
              {plotOpen ? 'Ler menos' : 'Ler mais'}
            </button>
          )}
          {shownCredits.length > 0 && (
            <dl className="mt-4 grid max-w-2xl gap-x-6 gap-y-1 text-body-sm sm:grid-cols-[auto_1fr]">
              {shownCredits.map((c) => (
                <div key={c.label} className="contents">
                  <dt className="text-on-surface-muted">{c.label}</dt>
                  <dd className="mb-1 text-white sm:mb-0">{c.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">{actions}</div>
          {footnote}
        </div>
        {poster && (
          <img
            src={poster}
            alt={title}
            className="ml-auto hidden w-56 shrink-0 rounded-2xl border border-outline-soft shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] lg:block"
          />
        )}
      </div>
    </section>
  )
}
