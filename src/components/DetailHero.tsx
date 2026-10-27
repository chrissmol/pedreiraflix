import { useState, type ReactNode } from 'react'
import { displayTitle } from '../lib/displayTitle'
import { proxyImage } from '../lib/xtream'
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
  /** Logo do titulo (TMDB) no lugar do nome escrito; se a imagem falhar, volta o nome. */
  logo?: string | null
  /** Classificacao indicativa (L, 10...18), nas cores oficiais. */
  certification?: string | null
  /** Aviso curto embaixo da sinopse ("Sinopse traduzida por IA"). */
  plotNote?: string | null
}

// Cores da classificacao indicativa do Ministerio da Justica.
const RATING_COLORS: Record<string, string> = {
  L: 'bg-[#0c9447] text-white',
  '10': 'bg-[#0f7dc2] text-white',
  '12': 'bg-[#f8c411] text-black',
  '14': 'bg-[#e67824] text-white',
  '16': 'bg-[#db2827] text-white',
  '18': 'bg-black text-white ring-1 ring-white/60',
}

/** Topo das paginas de filme e de serie no layout do Stitch: fundo em tela cheia, selos, genero em
 * destaque, titulo grande, sinopse, creditos, botoes em pilula e o poster a direita no desktop. */
export default function DetailHero({ title: rawTitle, backdrop, poster, imdbRating, chips, genre, plot, credits, actions, footnote, status, logo, certification, plotNote }: DetailHeroProps) {
  // Sem os enfeites do provedor ("[L]", ano repetido), como no destaque e nos posteres.
  const title = displayTitle(rawTitle)
  const shownCredits = credits.filter((c) => c.value)
  const [plotOpen, setPlotOpen] = useState(false)
  const [logoFailed, setLogoFailed] = useState<string | null>(null)
  const showLogo = logo && logoFailed !== logo
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
            {certification && RATING_COLORS[certification] && (
              <span
                title={certification === 'L' ? 'Livre para todos os públicos' : `Não recomendado para menores de ${certification} anos`}
                className={`flex h-6 min-w-6 items-center justify-center rounded px-1 text-label-badge font-extrabold ${RATING_COLORS[certification]}`}
              >
                {certification}
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
          {showLogo ? (
            <h1>
              <img
                src={proxyImage(logo) ?? undefined}
                alt={title}
                onError={() => setLogoFailed(logo)}
                className="max-h-24 max-w-[70%] object-contain object-left drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] sm:max-h-36 sm:max-w-md"
              />
            </h1>
          ) : (
            <h1 className="font-display text-headline-lg text-white sm:text-display-hero">{title}</h1>
          )}
          {plot && (
            <p className={`mt-4 max-w-2xl text-body-md text-on-surface-variant sm:text-body-lg ${longPlot && !plotOpen ? 'line-clamp-4' : ''}`}>
              {plot}
            </p>
          )}
          {plot && plotNote && <p className="mt-1 text-body-sm text-on-surface-muted">{plotNote}</p>}
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
