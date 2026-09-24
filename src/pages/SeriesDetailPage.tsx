import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Download, Play, Plus } from '../components/icons'
import { cached } from '../lib/cache'
import { useXtream } from '../hooks/useXtream'
import { useLibraryStore } from '../store/library'
import type { SeriesDetails } from '../types'

export default function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>()
  const client = useXtream()
  const navigate = useNavigate()
  const [series, setSeries] = useState<SeriesDetails | null>(null)
  const [activeSeason, setActiveSeason] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite)
  const isFavorite = useLibraryStore((s) => s.isFavorite('series', Number(id)))
  const episodeProgress = useLibraryStore((s) => s.progress)
  const watched = useLibraryStore((s) => s.watched)

  useEffect(() => {
    if (!client || !id) return
    setLoading(true)
    cached(`series-info:${id}`, () => client.getSeriesInfo(Number(id)))
      .then((data) => {
        setSeries(data)
        setActiveSeason(data.seasons[0]?.seasonNumber ?? 1)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar série'))
      .finally(() => setLoading(false))
  }, [client, id])

  if (loading) return <div className="pt-32 text-center text-zinc-400">Carregando...</div>
  if (error || !series) return <div className="pt-32 text-center text-rose-400">{error || 'Série não encontrada'}</div>

  const backdrop = series.backdropPath[0] || series.cover
  const season = series.seasons.find((s) => s.seasonNumber === activeSeason)

  return (
    <div className="min-h-screen pb-16">
      <div className="relative h-[46vw] max-h-[520px] min-h-[280px] w-full">
        {backdrop && <img src={backdrop} alt={series.name} className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#06070c] via-[#06070c]/60 to-transparent" />
        <div className="pointer-events-none absolute -right-16 top-0 h-64 w-64 rounded-full bg-brand-500/15 blur-[100px]" />
      </div>

      <div className="relative z-10 -mt-24 flex flex-col gap-6 px-4 sm:flex-row sm:px-10">
        {series.cover && (
          <img src={series.cover} alt={series.name} className="glow-border hidden w-48 rounded-xl shadow-2xl sm:block" />
        )}
        <div className="flex-1">
          <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">{series.name}</h1>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-zinc-400">
            {series.releaseDate && <span>{series.releaseDate.slice(0, 4)}</span>}
            {series.rating && Number(series.rating) > 0 && (
              <span className="text-brand-300">★ {Number(series.rating).toFixed(1)}</span>
            )}
            {series.genre && <span>{series.genre}</span>}
            <span>{series.seasons.length} temporada(s)</span>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              onClick={() =>
                toggleFavorite({ kind: 'series', id: series.seriesId, name: series.name, image: series.cover })
              }
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 font-medium transition-all ${
                isFavorite
                  ? 'border-brand-400/40 bg-brand-500/15 text-brand-200'
                  : 'border-zinc-800 bg-zinc-900/70 text-white hover:border-brand-500/40 hover:bg-zinc-800'
              }`}
            >
              {isFavorite ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {isFavorite ? 'Na lista' : 'Minha lista'}
            </button>
          </div>

          {series.plot && <p className="mt-6 max-w-2xl text-zinc-300">{series.plot}</p>}

          <div className="mt-6 space-y-1 text-sm text-zinc-400">
            {series.cast && (
              <p>
                <span className="text-zinc-500">Elenco: </span>
                {series.cast}
              </p>
            )}
            {series.director && (
              <p>
                <span className="text-zinc-500">Direção: </span>
                {series.director}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-10 px-4 sm:px-10">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-display text-xl font-bold text-white">Episódios</h2>
          <select
            value={activeSeason}
            onChange={(e) => setActiveSeason(Number(e.target.value))}
            className="brand-focus ml-auto rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2 text-sm text-white"
          >
            {series.seasons.map((s) => (
              <option key={s.seasonNumber} value={s.seasonNumber}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          {season?.episodes.map((ep) => {
            const key = `series-${ep.id}`
            const inProgress = episodeProgress[key]
            const isWatched = Boolean(watched[key])
            const watchedPct = inProgress
              ? Math.min(100, Math.round((inProgress.positionSeconds / (inProgress.durationSeconds || 1)) * 100))
              : isWatched
                ? 100
                : 0

            return (
              <div
                key={ep.id}
                role="button"
                tabIndex={0}
                onClick={() =>
                  navigate(
                    `/watch/series/${ep.id}?ext=${ep.containerExtension}&name=${encodeURIComponent(
                      `${series.name} - ${ep.title}`,
                    )}&image=${encodeURIComponent(series.cover || '')}`,
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click()
                }}
                className="group relative flex w-full cursor-pointer items-start gap-4 overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-900/70 p-3 text-left transition-all duration-200 hover:border-brand-400/40 hover:bg-zinc-800 hover:shadow-[0_0_0_1px_rgba(58,151,255,0.25),0_12px_28px_-12px_rgba(15,123,255,0.5)]"
              >
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900 font-bold text-brand-300">
                  {isWatched ? <Check className="h-5 w-5 text-brand-400" /> : ep.episodeNum}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white">{ep.title}</p>
                    {isWatched && <span className="text-[10px] font-semibold uppercase text-brand-400">Assistido</span>}
                  </div>
                  {ep.duration && <p className="text-xs text-zinc-500">{ep.duration}</p>}
                  {ep.plot && <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{ep.plot}</p>}
                </div>
                {client && (
                  <a
                    href={client.downloadUrl('series', ep.id, ep.containerExtension, `${series.name} - ${ep.title}`)}
                    download
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-brand-300"
                    title="Baixar episódio"
                  >
                    <Download className="h-5 w-5" />
                  </a>
                )}
                <Play className="mt-2 h-5 w-5 shrink-0 text-zinc-500" />

                {watchedPct > 0 && (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                    <div
                      className={`h-full ${isWatched ? 'bg-zinc-500' : 'bg-gradient-to-r from-brand-500 to-brand-400'}`}
                      style={{ width: `${watchedPct}%` }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
