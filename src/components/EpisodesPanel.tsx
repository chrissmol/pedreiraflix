import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from './icons'
import { formatRuntime } from './videoPlayerUtils'
import { getTmdbInfo, type TmdbInfo } from '../lib/tmdb'
import { proxyImage } from '../lib/xtream'
import { useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'
import type { Episode, SeriesDetails } from '../types'

interface EpisodesPanelProps {
  series: SeriesDetails
  currentId: string
  onPick: (episode: Episode) => void
  onClose: () => void
}

/** Painel "Episodios" por cima do video, como o da Netflix: canto inferior direito, uma temporada por vez, cada
 * episodio com miniatura, titulo, sinopse e quanto ja foi visto. Na TV: cima/baixo andam na lista, esquerda/direita
 * trocam de temporada, OK toca, Voltar/Esc fecha. As teclas sao pegas antes do player (mesmo jeito da lista de canais). */
export default function EpisodesPanel({ series, currentId, onPick, onClose }: EpisodesPanelProps) {
  const seasons = [...series.seasons].filter((s) => s.episodes.length > 0).sort((a, b) => a.seasonNumber - b.seasonNumber)
  const [index, setIndex] = useState(() => Math.max(0, seasons.findIndex((s) => s.episodes.some((e) => e.id === currentId))))
  const season = seasons[index]
  const listRef = useRef<HTMLUListElement>(null)
  const profileId = useActiveProfileId()
  const progress = useLibraryStore((s) => s.progress)
  const watched = useLibraryStore((s) => s.watched)

  // Miniaturas do TVmaze quando o provedor nao manda (a mesma busca, ja em cache, da tela da serie).
  const [tmdb, setTmdb] = useState<TmdbInfo | null>(null)
  useEffect(() => {
    let cancelled = false
    getTmdbInfo(series.name, series.releaseDate, 'tv').then((info) => !cancelled && setTmdb(info))
    return () => {
      cancelled = true
    }
  }, [series.name, series.releaseDate])

  // Foco no episodio que esta passando (ou no primeiro da temporada nova), para o OK do controle ja ter onde cair.
  useEffect(() => {
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>('button')
    if (!items?.length) return
    const current = Array.from(items).find((b) => b.dataset.id === currentId)
    ;(current ?? items[0]).focus()
    ;(current ?? items[0]).scrollIntoView({ block: 'nearest' })
  }, [index, currentId])

  useEffect(() => {
    const step = (delta: number) => setIndex((i) => (i + delta + seasons.length) % seasons.length)
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') onClose()
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        const at = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = items[Math.min(items.length - 1, Math.max(0, at + (e.key === 'ArrowUp' ? -1 : 1)))]
        next?.focus()
        next?.scrollIntoView({ block: 'nearest' })
      } else if (e.key === 'Enter' && document.activeElement instanceof HTMLButtonElement && listRef.current?.contains(document.activeElement)) {
        document.activeElement.click() // o player tambem escuta o OK e cancelaria o clique do botao
      } else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [seasons.length, onClose])

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-end" role="dialog" aria-modal="true" aria-label="Episódios">
      {/* Tocar fora do painel fecha (celular/computador). */}
      <button className="absolute inset-0 bg-black/40" aria-label="Fechar episódios" onClick={onClose} tabIndex={-1} />
      <div className="relative m-2 flex max-h-[calc(100%-1rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-black/90 shadow-2xl backdrop-blur-md mb-[max(0.5rem,env(safe-area-inset-bottom))] mr-[max(0.5rem,env(safe-area-inset-right))] sm:m-6 sm:max-h-[calc(100%-3rem)]">
        <div className="flex items-center gap-1 border-b border-white/10 p-2">
          {seasons.length > 1 && (
            <button onClick={() => setIndex((i) => (i - 1 + seasons.length) % seasons.length)} aria-label="Temporada anterior" className="player-btn h-11 w-11 shrink-0" tabIndex={-1}>
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <p className="min-w-0 flex-1 truncate px-2 text-center text-body-md font-semibold text-white">
            {season ? `Temporada ${season.seasonNumber}` : 'Episódios'}
          </p>
          {seasons.length > 1 && (
            <button onClick={() => setIndex((i) => (i + 1) % seasons.length)} aria-label="Próxima temporada" className="player-btn h-11 w-11 shrink-0" tabIndex={-1}>
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
          <button onClick={onClose} aria-label="Fechar" className="player-btn h-11 w-11 shrink-0" tabIndex={-1}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {season?.episodes.map((ep) => {
            const key = `${profileId}:series-${ep.id}`
            const p = progress[key]
            const pct = p?.durationSeconds ? Math.min(100, (p.positionSeconds / p.durationSeconds) * 100) : watched[key] ? 100 : 0
            const thumb = ep.image || proxyImage(tmdb?.tvmaze?.episodeImages[`${ep.season}x${ep.episodeNum}`]) || season.cover || series.cover
            const isCurrent = ep.id === currentId
            return (
              <li key={ep.id}>
                <button
                  data-id={ep.id}
                  onClick={() => onPick(ep)}
                  aria-current={isCurrent || undefined}
                  className={`brand-focus flex w-full gap-3 rounded-xl p-2 text-left focus:bg-white/15 hover:bg-white/10 ${isCurrent ? 'bg-white/10' : ''}`}
                >
                  <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-white/10 sm:w-32">
                    {thumb && (
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    )}
                    {pct > 0 && (
                      <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                        <span className="block h-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`flex min-w-0 items-baseline gap-1.5 text-label-md ${isCurrent ? 'text-brand-300' : 'text-white'}`}>
                      <span className="shrink-0 text-on-surface-muted">{ep.episodeNum}.</span>
                      <span className="truncate">{ep.title}</span>
                    </span>
                    {formatRuntime(ep.duration) && <span className="text-label-badge text-on-surface-muted">{formatRuntime(ep.duration)}</span>}
                    {ep.plot && <span className="mt-0.5 line-clamp-2 text-body-sm text-on-surface-variant">{ep.plot}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
