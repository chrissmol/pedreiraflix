import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BlockedByProfile from '../components/BlockedByProfile'
import DetailHero from '../components/DetailHero'
import DownloadButton from '../components/DownloadButton'
import { Check, FileArrowDown, Play, Plus } from '../components/icons'
import { cached } from '../lib/cache'
import { useXtream } from '../hooks/useXtream'
import { isCategoryBlocked } from '../lib/parentalControl'
import { getTmdbInfo, type TmdbInfo } from '../lib/tmdb'
import { formatRuntime } from '../components/videoPlayerUtils'
import { useLibraryStore } from '../store/library'
import { useActiveProfile, useActiveProfileId } from '../store/profiles'
import type { MovieDetails } from '../types'
import PageLoading from '../components/PageLoading'
import ErrorCard from '../components/ErrorCard'
import { friendlyCatalogError } from '../hooks/useCatalog'

export default function MovieDetailPage() {
  const { id } = useParams<{ id: string }>()
  const client = useXtream()
  const navigate = useNavigate()
  const [movie, setMovie] = useState<MovieDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const profileId = useActiveProfileId()
  const isKids = Boolean(useActiveProfile()?.isKids)
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite)
  const isFavorite = useLibraryStore((s) => s.isFavorite(profileId, 'movie', Number(id)))

  useEffect(() => {
    if (!client || !id) return
    let cancelled = false
    // oxlint-disable-next-line react/set-state-in-effect -- route/profile changes start a new detail request.
    setLoading(true)
    setBlocked(false)
    setError(null)
    cached(`movie-info:${id}`, () => client.getVodInfo(Number(id)))
      .then((data) => {
        if (cancelled) return
        setMovie(data)
        // A direct link/bookmark bypasses the already-filtered catalog lists, so this is checked again here.
        if (isKids) isCategoryBlocked(client, 'movie', data.categoryId).then((value) => !cancelled && setBlocked(value))
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

  const [tmdb, setTmdb] = useState<TmdbInfo | null>(null)
  useEffect(() => {
    if (!movie) return
    let cancelled = false
    getTmdbInfo(movie.name, movie.releaseDate).then((info) => !cancelled && setTmdb(info))
    return () => {
      cancelled = true
    }
  }, [movie])

  if (loading) return <PageLoading />
  if (blocked) return <BlockedByProfile />
  if (error) return <ErrorCard message={error} onRetry={() => setAttempt((n) => n + 1)} className="mt-32" />
  if (!movie) return <ErrorCard message="Filme não encontrado." className="mt-32" />

  const backdrop = movie.backdropPath[0] || movie.streamIcon
  // The provider's own data wins; TMDB only fills what it left empty.
  const year = movie.releaseDate?.slice(0, 4) || tmdb?.year
  const rating = Number(movie.rating) > 0 ? Number(movie.rating) : tmdb?.rating
  const genre = movie.genre || tmdb?.genres.join(', ')
  const plot = movie.plot || tmdb?.overview
  // Xtream hands duration over as a raw clock string ("01:32:00"), which reads like a timestamp rather
  // than a length — every streaming service shows "1h 32min" here instead.
  const chips = [year, formatRuntime(movie.duration)].filter(Boolean) as string[]

  return (
    <div className="min-h-screen pb-16">
      <DetailHero
        title={movie.name}
        backdrop={backdrop}
        poster={movie.streamIcon}
        rating={rating}
        chips={chips}
        genre={genre}
        plot={plot}
        credits={[
          { label: 'Elenco', value: movie.cast },
          { label: 'Direção', value: movie.director },
        ]}
        actions={
          <>
            <button
              onClick={() =>
                navigate(
                  `/watch/movie/${movie.streamId}?ext=${movie.containerExtension}&name=${encodeURIComponent(
                    movie.name,
                  )}&image=${encodeURIComponent(movie.streamIcon || '')}`,
                )
              }
              className="btn-primary w-full sm:w-auto"
            >
              <Play className="h-5 w-5" /> Assistir
            </button>
            <button
              onClick={() =>
                toggleFavorite(profileId, { kind: 'movie', id: movie.streamId, name: movie.name, image: movie.streamIcon })
              }
              aria-label={isFavorite ? 'Na lista' : 'Minha lista'}
              title={isFavorite ? 'Na lista' : 'Minha lista'}
              className={`btn-icon sm:w-auto sm:gap-2 sm:px-6 sm:text-label-md ${isFavorite ? 'text-brand-300' : ''}`}
            >
              {isFavorite ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              <span className="hidden sm:inline">{isFavorite ? 'Na lista' : 'Minha lista'}</span>
            </button>
            <DownloadButton
              kind="movie"
              id={movie.streamId}
              ext={movie.containerExtension}
              name={movie.name}
              image={movie.streamIcon}
            />
            {client && (
              <a
                href={client.downloadUrl('movie', movie.streamId, movie.containerExtension, movie.name)}
                download
                title="Baixar o arquivo original (fora do app)"
                aria-label="Baixar arquivo"
                className="btn-icon sm:w-auto sm:gap-2 sm:px-6 sm:text-label-md"
              >
                {/* Not the same glyph as the offline download beside it: with labels hidden on phones, two
                    identical arrows gave no way to tell "save into the app" from "save to the device". */}
                <FileArrowDown className="h-5 w-5" /> <span className="hidden sm:inline">Baixar arquivo</span>
              </a>
            )}
          </>
        }
        footnote={
          tmdb && (
            <p className="mt-6 text-body-sm text-on-surface-muted">
              Dados complementares do TMDB. Este produto usa a API do TMDB, mas não é endossado nem certificado por ele.
            </p>
          )
        }
      />
    </div>
  )
}
