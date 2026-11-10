import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Play, X } from './icons'
import { formatRuntime } from './videoPlayerUtils'
import { displayTitle, episodeTitle } from '../lib/displayTitle'
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

/** Painel "Episodios" por cima do video, como o da Netflix: fica na lateral direita, o cabecalho tem o seletor de
 * temporada (abre a lista de temporadas), cada episodio e uma linha com numero, miniatura (com barra de progresso),
 * titulo e duracao, e so o episodio em foco/passando abre a sinopse. Na TV: cima/baixo andam na lista, esquerda/direita
 * trocam de temporada, OK toca, Voltar/Esc fecha. As teclas sao pegas antes do player (mesmo jeito da lista de canais).
 * Precisa ficar DENTRO do container do player: e ele que entra em tela cheia, o que estiver fora some. */
export default function EpisodesPanel({ series, currentId, onPick, onClose }: EpisodesPanelProps) {
  const seasons = [...series.seasons].filter((s) => s.episodes.length > 0).sort((a, b) => a.seasonNumber - b.seasonNumber)
  const [index, setIndex] = useState(() => Math.max(0, seasons.findIndex((s) => s.episodes.some((e) => e.id === currentId))))
  const [picking, setPicking] = useState(false) // lista de temporadas no lugar dos episodios
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const season = seasons[index]
  const panelRef = useRef<HTMLDivElement>(null)
  const profileId = useActiveProfileId()
  const progress = useLibraryStore((s) => s.progress)
  const watched = useLibraryStore((s) => s.watched)
  const expandedId = focusedId ?? currentId

  // Miniaturas do TVmaze quando o provedor nao manda (a mesma busca, ja em cache, da tela da serie).
  const [tmdb, setTmdb] = useState<TmdbInfo | null>(null)
  useEffect(() => {
    let cancelled = false
    getTmdbInfo(series.name, series.releaseDate, 'tv').then((info) => !cancelled && setTmdb(info))
    return () => {
      cancelled = true
    }
  }, [series.name, series.releaseDate])

  // Foco no episodio que esta passando (ou no primeiro da temporada nova / na temporada atual), para o OK ja ter onde cair.
  useEffect(() => {
    const items = panelRef.current?.querySelectorAll<HTMLButtonElement>('[data-nav]')
    if (!items?.length) return
    const all = Array.from(items)
    const target = picking ? all.find((b) => b.dataset.id === String(index)) : all.find((b) => b.dataset.id === currentId)
    const el = target ?? all.find((b) => b.dataset.id) ?? all[0]
    el.focus()
    el.scrollIntoView({ block: 'nearest' })
  }, [index, currentId, picking])

  useEffect(() => {
    const step = (delta: number) => {
      setIndex((i) => (i + delta + seasons.length) % seasons.length)
      setFocusedId(null)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
        if (picking) setPicking(false)
        else onClose()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (picking) return
        step(e.key === 'ArrowLeft' ? -1 : 1)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const items = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[data-nav]') ?? [])
        const at = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = items[Math.min(items.length - 1, Math.max(0, at + (e.key === 'ArrowUp' ? -1 : 1)))]
        next?.focus()
        next?.scrollIntoView({ block: 'nearest' })
      } else if (e.key === 'Enter' && document.activeElement instanceof HTMLButtonElement && panelRef.current?.contains(document.activeElement)) {
        document.activeElement.click() // o player tambem escuta o OK e cancelaria o clique do botao
      } else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [seasons.length, onClose, picking])

  return (
    // data-controls: o player ignora toques/cliques aqui (senao pausaria e abriria tela cheia por baixo).
    <div data-controls className="absolute inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Episódios">
      {/* Tocar fora do painel fecha (celular/computador). */}
      <button className="anim-backdrop absolute inset-0 bg-gradient-to-l from-black/70 to-black/20" aria-label="Fechar episódios" onClick={onClose} tabIndex={-1} />
      <div
        ref={panelRef}
        className="anim-slide-right relative flex h-full w-[92%] flex-col bg-black/90 pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] shadow-2xl backdrop-blur-md sm:w-full sm:max-w-md"
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-label-badge text-on-surface-muted">{displayTitle(series.name)}</p>
            <button
              data-nav
              onClick={() => setPicking((v) => !v)}
              aria-label="Escolher temporada"
              aria-expanded={picking}
              tabIndex={-1}
              className="brand-focus -ml-1 mt-0.5 flex max-w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-headline-sm font-semibold text-white hover:bg-white/10 focus:bg-white/15"
            >
              <span className="truncate">{season ? `Temporada ${season.seasonNumber}` : 'Episódios'}</span>
              {seasons.length > 1 && <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${picking ? 'rotate-180' : ''}`} />}
            </button>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="player-btn h-11 w-11 shrink-0" tabIndex={-1}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {picking
            ? seasons.map((s, i) => (
                <li key={s.seasonNumber}>
                  <button
                    data-nav
                    data-id={i}
                    onClick={() => {
                      setIndex(i)
                      setFocusedId(null)
                      setPicking(false)
                    }}
                    aria-current={i === index || undefined}
                    className="brand-focus flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-body-md text-white hover:bg-white/10 focus:bg-white/15"
                  >
                    <span className="flex-1">Temporada {s.seasonNumber}</span>
                    <span className="text-label-badge text-on-surface-muted">{s.episodes.length} episódios</span>
                    {i === index && <Check className="h-5 w-5 text-brand-300" />}
                  </button>
                </li>
              ))
            : season?.episodes.map((ep) => {
                const key = `${profileId}:series-${ep.id}`
                const p = progress[key]
                const pct = p?.durationSeconds ? Math.min(100, (p.positionSeconds / p.durationSeconds) * 100) : watched[key] ? 100 : 0
                const thumb = ep.image || proxyImage(tmdb?.tvmaze?.episodeImages[`${ep.season}x${ep.episodeNum}`]) || season.cover || series.cover
                const isCurrent = ep.id === currentId
                const open = ep.id === expandedId
                return (
                  <li key={ep.id}>
                    <button
                      data-nav
                      data-id={ep.id}
                      onClick={() => onPick(ep)}
                      onFocus={() => setFocusedId(ep.id)}
                      onMouseEnter={() => setFocusedId(ep.id)}
                      aria-current={isCurrent || undefined}
                      className={`brand-focus flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors hover:bg-white/10 focus:bg-white/15 ${open ? 'bg-white/10' : ''}`}
                    >
                      <span className="w-6 shrink-0 pt-6 text-center text-headline-sm text-on-surface-muted">{ep.episodeNum}</span>
                      <span className="flex min-w-0 flex-1 flex-col gap-2">
                        <span className="flex gap-3">
                          <span className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-white/10 sm:w-36">
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
                            {open && (
                              <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <Play className="h-8 w-8 text-white" />
                              </span>
                            )}
                            {pct > 0 && (
                              <span className="absolute inset-x-0 bottom-0 h-1 bg-white/30">
                                <span className="block h-full bg-brand-500" style={{ width: `${pct}%` }} />
                              </span>
                            )}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                            <span className="line-clamp-2 text-label-md text-white">{episodeTitle(series.name, ep.title)}</span>
                            {formatRuntime(ep.duration) && <span className="text-label-badge text-on-surface-muted">{formatRuntime(ep.duration)}</span>}
                            {isCurrent && <span className="text-label-badge font-semibold text-brand-300">Assistindo</span>}
                          </span>
                        </span>
                        {open && ep.plot && <span className="line-clamp-5 text-body-sm text-on-surface-variant">{ep.plot}</span>}
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
