import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BlockedByProfile from '../components/BlockedByProfile'
import DownloadButton from '../components/DownloadButton'
import { Check, Download, Play, Plus } from '../components/icons'
import { cached } from '../lib/cache'
import { useXtream } from '../hooks/useXtream'
import { isCategoryBlocked } from '../lib/parentalControl'
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
    setLoading(true)
    setBlocked(false)
    cached(`movie-info:${id}`, () => client.getVodInfo(Number(id)))
      .then((data) => {
        setMovie(data)
        // A direct link/bookmark bypasses the already-filtered catalog lists, so this is checked again here.
        if (isKids) isCategoryBlocked(client, 'movie', data.categoryId).then(setBlocked)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar filme'))
      .finally(() => setLoading(false))
  }, [client, id, isKids])

  if (loading) return <div className="pt-32 text-center text-zinc-400">Carregando...</div>
  if (blocked) return <BlockedByProfile />
  if (error || !movie) return <div className="pt-32 text-center text-rose-400">{error || 'Filme não encontrado'}</div>

  const backdrop = movie.backdropPath[0] || movie.streamIcon

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
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-zinc-400">
            {movie.releaseDate && <span>{movie.releaseDate.slice(0, 4)}</span>}
            {movie.duration && <span>{movie.duration}</span>}
            {movie.rating && Number(movie.rating) > 0 && (
              <span className="text-brand-300">★ {Number(movie.rating).toFixed(1)}</span>
            )}
            {movie.genre && <span>{movie.genre}</span>}
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
              className="flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 font-bold text-black shadow-[0_10px_30px_-10px_rgba(15,123,255,0.6)] transition-all hover:scale-[1.03]"
            >
              <Play className="h-5 w-5" /> Assistir
            </button>
            <button
              onClick={() =>
                toggleFavorite(profileId, { kind: 'movie', id: movie.streamId, name: movie.name, image: movie.streamIcon })
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
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-4 py-2.5 font-medium text-white transition-all hover:border-brand-500/40 hover:bg-zinc-800"
              >
                <Download className="h-5 w-5" /> Baixar arquivo
              </a>
            )}
          </div>

          {movie.plot && <p className="mt-6 max-w-2xl text-zinc-300">{movie.plot}</p>}

          <div className="mt-6 space-y-1 text-sm text-zinc-400">
            {movie.cast && (
              <p>
                <span className="text-zinc-500">Elenco: </span>
                {movie.cast}
              </p>
            )}
            {movie.director && (
              <p>
                <span className="text-zinc-500">Direção: </span>
                {movie.director}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
