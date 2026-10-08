import { useEffect, useState, type ReactNode } from 'react'
import { Check, Info, Play, Plus } from './icons'
import { useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'
import { displayTitle } from '../lib/displayTitle'

export interface FeaturedCandidate {
  key: string
  title: string
  description: string | null
  image: string | null
  onPlay: () => void
  kind: 'movie' | 'series'
  id: number
  rating: number
  /** Ano e genero quando o provedor manda na listagem (series sim, filmes nao). */
  meta: string[]
}

interface HeroCarouselProps {
  /** Already built as the final movie/series-alternating, rating-sorted sequence — see HomePage.tsx. */
  items: FeaturedCandidate[]
  /** How long each item stays featured before the slot moves to the next one. Real wall-clock time, not
   * a timer that starts over on every reload — reopening the app mid-window shows the same title it
   * would've shown if you'd left the tab open the whole time. */
  slotMs?: number
  /** Rendered as a third button beside Assistir/Detalhes (see HomePage's "Surpreenda-me"). */
  action?: ReactNode
  /** Catalog still loading: shows a hero-shaped skeleton. Done with nothing to feature: only the header's room. */
  loading?: boolean
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000

// Lets e2e tests use a millisecond-scale slot instead of waiting 2h for real; never set outside a test
// harness, so this is a no-op in the real app — same pattern as AutoLogout's override.
function resolveSlotMs(fallback: number): number {
  const override = (typeof window !== 'undefined' && (window as { __HERO_SLOT_MS_OVERRIDE__?: number }).__HERO_SLOT_MS_OVERRIDE__) || 0
  return override || fallback
}

/** Rotating hero, restricted to the household's "only the very best" bar (≥8.5 — filtered by the caller)
 * and alternating movie/series: which title is "now" is computed straight from the wall clock (a stable
 * slot index into the sequence), not a running timer, so it survives reloads and new tabs consistently.
 * No manual dot navigation on purpose — it's meant to just show one pick at a time, not advertise how
 * many titles qualify. If a poster image actually fails to load (dead URL, blocked host, broken provider)
 * it's excluded and the slot recomputes over what's left, instead of just sitting there broken. */
export default function HeroCarousel({ items, slotMs = TWO_HOURS_MS, action, loading }: HeroCarouselProps) {
  slotMs = resolveSlotMs(slotMs)
  const [now, setNow] = useState(() => Date.now())
  const [broken, setBroken] = useState<Set<string>>(new Set())

  // Rechecks often enough to catch the slot boundary even with a tiny test override, without polling
  // wastefully during the real 2h window.
  useEffect(() => {
    const recheckMs = Math.max(1000, Math.min(5 * 60 * 1000, Math.floor(slotMs / 10)))
    const timer = setInterval(() => setNow(Date.now()), recheckMs)
    return () => clearInterval(timer)
  }, [slotMs])

  const playable = items.filter((it) => !broken.has(it.key))
  const timeSlot = playable.length > 0 ? Math.floor(now / slotMs) % playable.length : 0
  const index = timeSlot % Math.max(1, playable.length)
  const current = playable[index]
  const profileId = useActiveProfileId()
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite)
  const isFavorite = useLibraryStore((s) => (current ? s.isFavorite(profileId, current.kind, current.id) : false))

  // Reserves the same footprint even with nothing to show yet (catalog still loading, or every
  // candidate's image just broke) instead of collapsing to zero height — the fixed, transparent TopNav
  // sits on top of this area by design, so a collapsed hero used to let whatever HomePage renders next
  // (the "Surpreenda-me" button, first row) ride up underneath it and visually collide with the header's
  // own search box/avatar, on every screen size.
  //
  // Ainda carregando: o formato do destaque (titulo, linha, botoes) brilhando, nao so um bloco escuro — o
  // video do iPhone (08/10) mostrou o retangulo antigo lido como um vazio grande. Catalogo pronto e nada
  // para destacar (nenhum titulo 8.5+): so o espaco do cabecalho, em vez de um vazio que nunca enche.
  if (!current) {
    if (!loading) return <div className="h-[calc(5rem+env(safe-area-inset-top))]" />
    return (
      <div data-testid="hero-carregando" className="relative h-[60vw] max-h-[560px] min-h-[420px] w-full overflow-hidden">
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 px-4 pb-10 sm:px-10 sm:pb-16">
          <div className="skeleton h-10 w-3/4 max-w-md rounded-lg sm:h-14" />
          <div className="skeleton h-4 w-1/2 max-w-sm rounded" />
          <div className="flex gap-3">
            <div className="skeleton h-12 w-36 rounded-full" />
            <div className="skeleton h-12 w-12 rounded-full" />
          </div>
        </div>
      </div>
    )
  }

  // Capped shorter than the old 680px so the first row always peeks above the fold on a desktop/laptop
  // screen — the cue every streaming home page uses to say "there's more below", which a hero that
  // exactly filled the viewport was swallowing.
  return (
    <div className="relative h-[60vw] max-h-[560px] min-h-[420px] w-full overflow-hidden">
      {current.image && (
        <img
          key={current.key}
          src={current.image}
          alt={current.title}
          className="absolute inset-0 h-full w-full object-cover object-top"
          onError={() => setBroken((prev) => new Set(prev).add(current.key))}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-surface/90 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
      <div className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-brand-500/10 blur-[100px]" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 px-4 pb-10 sm:px-10 sm:pb-16">
        {/* No maximo 2 linhas e sem os enfeites do provedor: um titulo longo subia ate o cabecalho e ficava por
            cima do logo (painel de 654px, 08/10). */}
        <h1 className="font-display line-clamp-2 max-w-xl text-balance text-headline-lg text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] sm:text-display-hero">
          {displayTitle(current.title)}
        </h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label-md text-on-surface-variant drop-shadow">
          {current.rating > 0 && <span className="font-semibold text-rating">★ {current.rating.toFixed(1)}</span>}
          {[current.kind === 'movie' ? 'Filme' : 'Série', ...current.meta].map((m) => (
            <span key={m} className="before:pr-2 before:text-on-surface-muted before:content-['·'] first:before:content-none">
              {m}
            </span>
          ))}
        </div>
        {current.description && (
          <p className="line-clamp-3 max-w-lg text-body-md text-on-surface-variant drop-shadow sm:text-body-lg">{current.description}</p>
        )}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={current.onPlay}
            className="btn-primary"
          >
            <Play className="h-5 w-5" /> Assistir
          </button>
          <button
            onClick={current.onPlay}
            aria-label="Detalhes"
            title="Detalhes"
            className="btn-icon sm:w-auto sm:gap-2 sm:px-6 sm:text-label-md"
          >
            <Info className="h-5 w-5" /> <span className="hidden sm:inline">Detalhes</span>
          </button>
          <button
            onClick={() => toggleFavorite(profileId, { kind: current.kind, id: current.id, name: current.title, image: current.image })}
            aria-label={isFavorite ? 'Remover da Minha lista' : 'Adicionar à Minha lista'}
            title={isFavorite ? 'Na lista' : 'Minha lista'}
            className="btn-icon"
          >
            {isFavorite ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          </button>
          {action}
        </div>
      </div>
    </div>
  )
}
