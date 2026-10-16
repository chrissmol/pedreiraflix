import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BlockedByProfile from '../components/BlockedByProfile'
import DetailHero from '../components/DetailHero'
import DownloadButton from '../components/DownloadButton'
import SeasonDownloadButton from '../components/SeasonDownloadButton'
import SeriesZipButton from '../components/SeriesZipButton'
import { Check, FileArrowDown, Play, Plus, RefreshCw } from '../components/icons'
import { formatRemaining, formatRuntime } from '../components/videoPlayerUtils'
import { cached } from '../lib/cache'
import { useXtream } from '../hooks/useXtream'
import { isCategoryBlocked } from '../lib/parentalControl'
import { useLibraryStore } from '../store/library'
import { useActiveProfile, useActiveProfileId } from '../store/profiles'
import type { Episode, SeriesDetails } from '../types'
import PageLoading from '../components/PageLoading'
import ErrorCard from '../components/ErrorCard'
import { friendlyCatalogError } from '../hooks/useCatalog'
import { getTmdbInfo } from '../lib/tmdb'

export default function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>()
  const client = useXtream()
  const navigate = useNavigate()
  const [series, setSeries] = useState<SeriesDetails | null>(null)
  const [activeSeason, setActiveSeason] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const profileId = useActiveProfileId()
  const isKids = Boolean(useActiveProfile()?.isKids)
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite)
  const isFavorite = useLibraryStore((s) => s.isFavorite(profileId, 'series', Number(id)))
  const episodeProgress = useLibraryStore((s) => s.progress)
  const watched = useLibraryStore((s) => s.watched)

  useEffect(() => {
    if (!client || !id) return
    let cancelled = false
    // oxlint-disable-next-line react/set-state-in-effect -- route/profile changes start a new detail request.
    setLoading(true)
    setBlocked(false)
    setError(null)
    cached(`series-info:${id}`, () => client.getSeriesInfo(Number(id)))
      .then((data) => {
        if (cancelled) return
        setSeries(data)
        setActiveSeason(data.seasons[0]?.seasonNumber ?? 1)
        if (isKids) isCategoryBlocked(client, 'series', data.categoryId).then((value) => !cancelled && setBlocked(value))
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyCatalogError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [client, id, isKids, attempt])

  // So a nota do IMDb (via /api/tmdb, kind=tv); genero/sinopse da serie continuam vindo so do provedor.
  const [imdbRating, setImdbRating] = useState<string | null>(null)
  useEffect(() => {
    if (!series) return
    let cancelled = false
    getTmdbInfo(series.name, series.releaseDate, 'tv').then((info) => !cancelled && setImdbRating(info?.imdbRating ?? null))
    return () => {
      cancelled = true
    }
  }, [series])

  if (loading) return <PageLoading />
  if (blocked) return <BlockedByProfile />
  if (error) return <ErrorCard message={error} onRetry={() => setAttempt((n) => n + 1)} className="mt-32" />
  if (!series) return <ErrorCard message="Série não encontrada." className="mt-32" />

  const backdrop = series.backdropPath[0] || series.cover
  const rating = Number(series.rating) > 0 ? Number(series.rating) : null
  const chips = [
    series.releaseDate?.slice(0, 4),
    `${series.seasons.length} temporada${series.seasons.length > 1 ? 's' : ''}`,
  ].filter(Boolean) as string[]
  const season = series.seasons.find((s) => s.seasonNumber === activeSeason)

  const playUrl = (ep: Episode) =>
    `/watch/series/${ep.id}?ext=${ep.containerExtension}&name=${encodeURIComponent(
      `${series.name} - ${ep.title}`,
    )}&image=${encodeURIComponent(series.cover || '')}&seriesId=${series.seriesId}`

  // "Continuar T2:E4": o episodio desta serie com progresso mais recente; sem nenhum, o primeiro.
  const allEpisodes = series.seasons.flatMap((s) => s.episodes)
  const resume = allEpisodes
    .flatMap((ep) => {
      const p = episodeProgress[`${profileId}:series-${ep.id}`]
      return p ? [{ ep, p }] : []
    })
    .sort((a, b) => b.p.updatedAt - a.p.updatedAt)[0]
  const first = allEpisodes[0]
  const tag = (ep: Episode) => `T${ep.season}:E${ep.episodeNum}`

  return (
    <div className="min-h-screen pb-16">
      <DetailHero
        title={series.name}
        backdrop={backdrop}
        poster={series.cover}
        rating={rating}
        imdbRating={imdbRating}
        chips={chips}
        genre={series.genre}
        plot={series.plot}
        credits={[
          { label: 'Elenco', value: series.cast },
          { label: 'Direção', value: series.director },
        ]}
        actions={
          <>
            {resume ? (
              <>
                <button onClick={() => navigate(playUrl(resume.ep))} className="btn-primary flex-1 sm:flex-none">
                  <Play className="h-5 w-5" />
                  <span className="text-left leading-tight">
                    Continuar {tag(resume.ep)}
                    <span className="block text-body-sm font-normal text-white/80">
                      {formatRemaining(resume.p.positionSeconds, resume.p.durationSeconds)}
                    </span>
                  </span>
                </button>
                {first && first.id !== resume.ep.id && (
                  <button onClick={() => navigate(playUrl(first))} className="btn-secondary">
                    <RefreshCw className="h-5 w-5" /> Do início ({tag(first)})
                  </button>
                )}
              </>
            ) : (
              first && (
                <button onClick={() => navigate(playUrl(first))} className="btn-primary flex-1 sm:flex-none">
                  <Play className="h-5 w-5" /> Assistir {tag(first)}
                </button>
              )
            )}
            <button
              onClick={() =>
                toggleFavorite(profileId, { kind: 'series', id: series.seriesId, name: series.name, image: series.cover })
              }
              aria-label={isFavorite ? 'Na lista' : 'Minha lista'}
              title={isFavorite ? 'Na lista' : 'Minha lista'}
              className={`btn-icon sm:w-auto sm:gap-2 sm:px-6 sm:text-label-md ${isFavorite ? 'text-brand-300' : ''}`}
            >
              {isFavorite ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              <span className="hidden sm:inline">{isFavorite ? 'Na lista' : 'Minha lista'}</span>
            </button>
          </>
        }
      />

      <div className="px-4 sm:px-10">
        {/* Abas de temporada em pilula, como no Stitch; rolam na horizontal quando sao muitas. */}
        <div
          role="tablist"
          aria-label="Temporada"
          className="no-scrollbar -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:rounded-2xl sm:bg-surface-low sm:p-2"
        >
          {series.seasons.map((s) => (
            <button
              key={s.seasonNumber}
              role="tab"
              aria-selected={s.seasonNumber === activeSeason}
              onClick={() => setActiveSeason(s.seasonNumber)}
              className={`shrink-0 whitespace-nowrap rounded-full px-5 py-2.5 text-label-md transition-colors ${
                s.seasonNumber === activeSeason
                  ? 'bg-brand-fill text-white shadow-[0_0_20px_-4px_rgba(15,123,255,0.6)]'
                  : 'bg-surface-container text-on-surface-variant hover:text-white sm:bg-transparent'
              }`}
            >
              {s.name} <span className={`text-body-sm ${s.seasonNumber === activeSeason ? 'text-white/90' : 'opacity-70'}`}>({s.episodes.length} eps)</span>
            </button>
          ))}
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-3">
          <h2 className="font-display text-headline-md text-white">Episódios</h2>
          <span className="text-body-sm text-on-surface-muted">{season?.episodes.length ?? 0} nesta temporada</span>
          <div className="sm:ml-auto">
            <SeriesZipButton series={series} />
          </div>
          {season && (
            <div>
              <SeasonDownloadButton
                seriesId={series.seriesId}
                seriesName={series.name}
                season={season.seasonNumber}
                episodes={season.episodes}
                image={series.cover}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {season?.episodes.map((ep) => {
            const key = `${profileId}:series-${ep.id}`
            const inProgress = episodeProgress[key]
            const isWatched = Boolean(watched[key])
            const isCurrent = resume?.ep.id === ep.id
            const watchedPct = inProgress
              ? Math.min(100, Math.round((inProgress.positionSeconds / (inProgress.durationSeconds || 1)) * 100))
              : isWatched
                ? 100
                : 0
            const thumb = ep.image || season.cover || backdrop

            return (
              <div
                key={ep.id}
                onClick={() => navigate(playUrl(ep))}
                className={`group relative flex cursor-pointer gap-3 rounded-2xl border p-2.5 text-left transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 sm:gap-4 sm:p-3 ${
                  isCurrent
                    ? 'border-brand-500/50 bg-surface-container shadow-[0_0_30px_-12px_rgba(15,123,255,0.5)]'
                    : 'border-outline-soft bg-surface-low hover:border-outline-strong hover:bg-surface-container'
                }`}
              >
                {/* O botao cobre a linha so para teclado e leitor de tela (a linha tem outros botoes dentro, e
                    botao dentro de botao e invalido); o clique do mouse sobe do conteudo para a linha. */}
                <button
                  type="button"
                  data-spatial
                  aria-label={`Assistir episódio ${ep.episodeNum}: ${ep.title}`}
                  className="absolute inset-0 rounded-2xl"
                />
                <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-surface-high sm:w-44">
                  {thumb && (
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500">
                      <Play className="h-5 w-5 text-white" />
                    </span>
                  </span>
                  {(isWatched || inProgress) && (
                    <span
                      className={`absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-label-badge font-semibold ${
                        isWatched ? 'bg-black/70 text-done' : 'bg-brand-fill text-white'
                      }`}
                    >
                      {isWatched ? 'Assistido' : 'Em andamento'}
                    </span>
                  )}
                  {formatRuntime(ep.duration) && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-label-badge text-white">
                      {formatRuntime(ep.duration)}
                    </span>
                  )}
                  {watchedPct > 0 && (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                      <div
                        className={`h-full ${isWatched ? 'bg-on-surface-muted' : 'bg-brand-500'}`}
                        style={{ width: `${watchedPct}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="relative flex min-w-0 flex-1 flex-col">
                  <p className="flex min-w-0 items-baseline gap-1.5 text-label-md text-white">
                    <span className="shrink-0 text-on-surface-muted">Ep. {ep.episodeNum} •</span>
                    <span className={`truncate ${isCurrent ? 'text-brand-300' : ''}`}>{ep.title}</span>
                  </p>
                  {ep.plot && <p className="mt-1 line-clamp-2 text-body-sm text-on-surface-variant">{ep.plot}</p>}
                  <div className="mt-auto flex items-center gap-1 pt-2">
                    <span className="mr-auto text-label-badge">
                      {isWatched ? (
                        <span className="inline-flex items-center gap-1 text-done">
                          <Check className="h-3.5 w-3.5" /> Concluído
                        </span>
                      ) : inProgress ? (
                        <span className="text-brand-300">
                          {formatRemaining(inProgress.positionSeconds, inProgress.durationSeconds)}
                        </span>
                      ) : null}
                    </span>
                    <span onClick={(e) => e.stopPropagation()}>
                      <DownloadButton
                        kind="series"
                        id={ep.id}
                        ext={ep.containerExtension}
                        name={`${series.name} - ${ep.title}`}
                        image={series.cover}
                        seriesId={series.seriesId}
                        compact
                      />
                    </span>
                    {client && (
                      <a
                        href={client.downloadUrl('series', ep.id, ep.containerExtension, `${series.name} - ${ep.title}`)}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-highest hover:text-white"
                        title="Baixar arquivo original (fora do app)"
                        aria-label="Baixar arquivo original"
                      >
                        {/* Glifo diferente do download para ver offline: sem rotulo, duas setas iguais nao
                            diziam qual era qual - mesma correcao ja feita na pagina de filme. */}
                        <FileArrowDown className="h-5 w-5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
