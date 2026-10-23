import { useEffect, useRef, useState } from 'react'
import { useImdbRating, type ImdbQuery } from '../hooks/useImdbRating'
import { isTv } from '../lib/device'
import { displayTitle } from '../lib/displayTitle'
import { useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'
import { Check, Play } from './icons'

interface PosterCardProps {
  title: string
  image: string | null
  onClick: () => void
  /** Mostra a nota do IMDb do titulo (so ela, a pedido do Chris), buscada quando o poster aparece na tela. */
  imdb?: ImdbQuery
  subtitle?: string | null
  /** 0–100. Renders a thin progress bar across the bottom of the poster, always visible (not just on
   * hover) — the same at-a-glance "how far in am I" cue Netflix shows in Continue Watching rows. */
  progressPct?: number | null
  /** True inside a CSS grid (PosterGrid), where the grid track itself sizes the card — the fixed
   * w-32/sm:w-40/md:w-44 used everywhere else is for a horizontal scroll row (Row.tsx), which has no
   * track to size against. */
  fill?: boolean
  /** Filme visto ou serie concluida neste perfil ganha o ✓ no canto, como no Plex/Jellyfin, no verde do "Assistido" dos episodios. */
  watchedRef?: { kind: 'movie' | 'series'; id: number }
}

export default function PosterCard({ title: rawTitle, image, onClick, imdb, subtitle, progressPct, fill, watchedRef }: PosterCardProps) {
  // Sem os enfeites do provedor ("[L]", ano repetido) em todo poster do app — mesma limpeza do destaque (#86).
  const title = displayTitle(rawTitle)
  const ref = useRef<HTMLButtonElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!imdb || seen || !el) return
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setSeen(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [imdb, seen])
  const rating = useImdbRating(imdb, seen)
  const profileId = useActiveProfileId()
  const done = useLibraryStore((s) =>
    !watchedRef ? false : watchedRef.kind === 'movie' ? Boolean(s.watched[`${profileId}:movie-${watchedRef.id}`]) : Boolean(s.seriesDone[`${profileId}:${watchedRef.id}`]?.done),
  )
  return (
    <button
      ref={ref}
      data-spatial
      onClick={onClick}
      // Apple-style hover: the card itself lifts and deepens its own (neutral) shadow — no colored
      // border/glow lighting up around it, unlike before.
      className={`brand-focus group relative aspect-2/3 overflow-hidden rounded-xl border border-outline-soft bg-surface-container text-left shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-300 ease-out active:scale-[0.97] hover:z-10 hover:-translate-y-1.5 hover:scale-[1.08] hover:border-outline-strong hover:shadow-[0_20px_45px_-12px_rgba(0,0,0,0.7)] focus-visible:z-10 focus-visible:-translate-y-1.5 focus-visible:scale-[1.08] ${
        // Grade de categoria inteira (milhares de cartoes): o navegador nao desenha o que esta fora da tela.
        fill ? 'w-full [content-visibility:auto]' : isTv ? 'w-28 shrink-0' : 'w-32 shrink-0 sm:w-40 md:w-44'
      }`}
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

      {/* O titulo fica SEMPRE visivel, como o brand book mostra: so o botao de play e revelado no hover.
          Esconder informacao atras de hover ja foi corrigido tres vezes neste projeto. */}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/25 to-transparent p-2.5">
        <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/90 opacity-0 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.6)] transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100">
          <Play className="h-3.5 w-3.5 text-white" />
        </div>
        <p className="line-clamp-2 text-label-badge font-semibold text-white">{title}</p>
        {subtitle && <p className="text-label-badge text-on-surface-variant">{subtitle}</p>}
      </div>


      {rating && (
        <span title="Nota do IMDb" className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-label-badge font-bold text-rating backdrop-blur-sm">
          ★ {rating}
        </span>
      )}

      {done && (
        <span
          role="img"
          aria-label={watchedRef?.kind === 'series' ? 'Série concluída' : 'Assistido'}
          title={watchedRef?.kind === 'series' ? 'Série concluída' : 'Assistido'}
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-done text-black shadow-[0_2px_8px_rgba(0,0,0,0.6)] ring-2 ring-black/40"
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      )}

      {!image && (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-high to-surface-container p-2 text-center text-label-badge text-on-surface-variant">
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
