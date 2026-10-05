import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BlockedByProfile from '../components/BlockedByProfile'
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

export default function MovieDetailPage() {
  const { id } = useParams<{ id: string }>()
  const client = useXtream()
  const navigate = useNavigate()
  const [movie, setMovie] = useState<MovieDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)

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
    cached(`movie-info:${id}`, () => client.getVodInfo(Number(id)))
      .then((data) => {
        if (cancelled) return
        setMovie(data)
        // A direct link/bookmark bypasses the already-filtered catalog lists, so this is checked again here.
        if (isKids) isCategoryBlocked(client, 'movie', data.categoryId).then((value) => !cancelled && setBlocked(value))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar filme')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [client, id, isKids])

  const [tmdb, setTmdb] = useState<TmdbInfo | null>(null)
  useEffect(() => {
    if (!movie) return
    let cancelled = false
    getTmdbInfo(movie.name, movie.releaseDate).then((info) => !cancelled && setTmdb(info))
    return () => {
      cancelled = true
    }
  }, [movie])

  if (loading) return <div className="pt-32 text-center text-zinc-400">Carregando...</div>
  if (blocked) return <BlockedByProfile />
  if (error || !movie) return <div className="pt-32 text-center text-rose-400">{error || 'Filme não encontrado'}</div>

  const backdrop = movie.backdropPath[0] || movie.streamIcon
  // The provider's own data wins; TMDB only fills what it left empty.
  const year = movie.releaseDate?.slice(0, 4) || tmdb?.year
  const rating = Number(movie.rating) > 0 ? Number(movie.rating) : tmdb?.rating
  const genre = movie.genre || tmdb?.genres.join(', ')
  const plot = movie.plot || tmdb?.overview
  // Xtream hands duration over as a raw clock string ("01:32:00"), which reads like a timestamp rather
  // than a length — every streaming service shows "1h 32min" here instead.
  const meta = [year, formatRuntime(movie.duration), genre].filter(Boolean)

  return (
    <div className="min-h-screen pb-16">
      <div className="relative h-[46vw] max-h-[520px] min-h-[280px] w-full">
        {backdrop && <img src={backdrop} alt={movie.name} className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#06070c] via-[#06070c]/60 to-transparent" />
        <div className="pointer-events-none absolute -right-16 top-0 h-64 w-64 rounded-full bg-brand-500/15 blur-[100px]" />
      </div>

      <div className="relative z-10 -mt-24 flex flex-col gap-6 px-4 sm:flex-row sm:px-10">
        {movie.streamIcon && (
          <img
            src={movie.streamIcon}
            alt={movie.name}
            className="glow-border hidden w-48 rounded-xl shadow-2xl sm:block"
          />
        )}
        <div className="flex-1">
          <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">{movie.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-400">
            {rating ? <span className="font-semibold text-brand-300">★ {rating.toFixed(1)}</span> : null}
            {meta.map((item, i) => (
              <span key={item}>
                {(i > 0 || rating) && <span className="pr-2 text-zinc-600">·</span>}
                {item}
              </span>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() =>
                navigate(
                  `/watch/movie/${movie.streamId}?ext=${movie.containerExtension}&name=${encodeURIComponent(
                    movie.name,
                  )}&image=${encodeURIComponent(movie.streamIcon || '')}`,
                )
              }
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 font-bold text-black shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] transition-all hover:scale-[1.03] sm:w-auto sm:py-2.5"
            >
              <Play className="h-5 w-5" /> Assistir
            </button>
            <button
              onClick={() =>
                toggleFavorite(profileId, { kind: 'movie', id: movie.streamId, name: movie.name, image: movie.streamIcon })
              }
              aria-label={isFavorite ? 'Na lista' : 'Minha lista'}
              title={isFavorite ? 'Na lista' : 'Minha lista'}
              className={`flex items-center gap-2 rounded-lg border p-2.5 font-medium transition-all sm:px-4 sm:py-2.5 ${
                isFavorite
                  ? 'border-brand-400/40 bg-brand-500/15 text-brand-200'
                  : 'border-zinc-800 bg-zinc-900/70 text-white hover:border-brand-500/40 hover:bg-zinc-800'
              }`}
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
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 p-2.5 font-medium text-white transition-all hover:border-brand-500/40 hover:bg-zinc-800 sm:px-4 sm:py-2.5"
              >
                {/* Not the same glyph as the offline download beside it: with labels hidden on phones, two
                    identical arrows gave no way to tell "save into the app" from "save to the device". */}
                <FileArrowDown className="h-5 w-5" /> <span className="hidden sm:inline">Baixar arquivo</span>
              </a>
            )}
          </div>

          {plot && <p className="mt-6 max-w-2xl text-zinc-300">{plot}</p>}

          <div className="mt-6 space-y-1 text-sm text-zinc-400">
            {movie.cast && (
              <p>
                <span className="text-zinc-400">Elenco: </span>
                {movie.cast}
              </p>
            )}
            {movie.director && (
              <p>
                <span className="text-zinc-400">Direção: </span>
                {movie.director}
              </p>
            )}
            {tmdb && <p className="pt-2 text-xs">Dados complementares do TMDB. Este produto usa a API do TMDB, mas não é endossado nem certificado por ele.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
