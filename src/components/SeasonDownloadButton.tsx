import { useXtream } from '../hooks/useXtream'
import { isDownloaded, useDownloadsFor, useDownloadsStore } from '../store/downloads'
import { useActiveProfileId } from '../store/profiles'
import type { Episode } from '../types'
import { Check, Download, X } from './icons'
import { isTv } from '../lib/device'

interface SeasonDownloadButtonProps {
  seriesId: number
  seriesName: string
  season: number
  episodes: Episode[]
  image: string | null
}

/** "Baixar temporada": queues every not-yet-downloaded episode of the season, one at a time, through the
 * same per-episode download the episode rows use. */
export default function SeasonDownloadButton({ seriesId, seriesName, season, episodes, image }: SeasonDownloadButtonProps) {
  const client = useXtream()
  const profileId = useActiveProfileId()
  const downloads = useDownloadsFor(profileId)
  const seasonKey = `${profileId}:season-${seriesId}-${season}`
  const running = useDownloadsStore((s) => s.seasons[seasonKey])
  const startSeason = useDownloadsStore((s) => s.startSeason)
  const stopSeason = useDownloadsStore((s) => s.stopSeason)

  // HLS episodes can't be downloaded (see DownloadButton), so they don't count either way.
  const downloadable = episodes.filter((ep) => ep.containerExtension !== 'm3u8')
  const missing = downloadable.filter((ep) => !isDownloaded(profileId, 'series', ep.id, downloads))
  if (downloadable.length === 0 || isTv) return null

  if (running) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span role="status" className="inline-flex items-center gap-2 text-label-md text-brand-300 tabular-nums">
          <Download className="h-4 w-4 animate-pulse motion-reduce:animate-none" />
          Baixando {Math.min(running.done + 1, running.total)} de {running.total}
        </span>
        <button
          onClick={() => stopSeason(seasonKey)}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-label-md text-on-surface-variant transition-colors hover:bg-surface-high hover:text-white"
        >
          <X className="h-4 w-4" /> Parar
        </button>
        <span className="w-full text-body-sm text-on-surface-muted">Mantenha o app aberto até terminar.</span>
      </div>
    )
  }

  if (missing.length === 0) {
    return (
      <span className="inline-flex items-center gap-2 text-label-md text-done">
        <Check className="h-4 w-4" /> Temporada baixada
      </span>
    )
  }

  return (
    <button
      onClick={() =>
        client &&
        startSeason(
          client,
          profileId,
          seasonKey,
          seriesId,
          missing.map((ep) => ({ id: ep.id, ext: ep.containerExtension, name: `${seriesName} - ${ep.title}` })),
          image,
        )
      }
      disabled={!client}
      className="inline-flex items-center gap-2 rounded-full bg-surface-container px-4 py-2 text-label-md text-white transition-colors hover:bg-surface-high disabled:opacity-50"
    >
      <Download className="h-4 w-4" />
      {missing.length === downloadable.length ? 'Baixar temporada' : `Baixar ${missing.length} restantes`}
    </button>
  )
}
