import { useEffect } from 'react'
import { Check, Download } from './icons'
import { useXtream } from '../hooks/useXtream'
import { isDownloaded, useDownloadsFor, useDownloadsStore } from '../store/downloads'
import { useActiveProfileId } from '../store/profiles'

interface DownloadButtonProps {
  kind: 'movie' | 'series'
  id: number | string
  ext: string
  name: string
  image: string | null
  seriesId?: number
  /** Episode rows want a compact icon-only button; the movie/series detail page wants the full label. */
  compact?: boolean
}

/** "Baixar para ver offline" — Netflix-style in-app download, distinct from the existing raw
 * "Baixar" (browser Save As) button: this one stores the video in IndexedDB so it plays from inside the
 * app later with no network at all, from the Downloads page. */
export default function DownloadButton({ kind, id, ext, name, image, seriesId, compact }: DownloadButtonProps) {
  const client = useXtream()
  const profileId = useActiveProfileId()
  const downloads = useDownloadsFor(profileId)
  const progress = useDownloadsStore((s) => s.progress[`${profileId}:${kind}-${id}`])
  const failed = useDownloadsStore((s) => s.failed[`${profileId}:${kind}-${id}`])
  const start = useDownloadsStore((s) => s.start)
  const refresh = useDownloadsStore((s) => s.refresh)
  const done = isDownloaded(profileId, kind, String(id), downloads)

  // Ensures the "already downloaded" state is correct even when this is the first component in the
  // session to touch the downloads store (e.g. opening a movie's page directly, without ever visiting
  // /downloads first) — cheap, idempotent IndexedDB read.
  useEffect(() => {
    refresh(profileId)
  }, [refresh, profileId])

  // HLS (.m3u8) is a manifest + many segments, not one file — fetch()-and-store-as-one-Blob doesn't
  // apply the way it does for a plain progressive mp4/webm. Xtream VOD is normally progressive, so this
  // rarely hides the button in practice.
  if (ext === 'm3u8') return null

  if (done) {
    return (
      <span
        className={`flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 font-medium text-emerald-300 ${
          compact ? 'p-2.5' : 'p-2.5 sm:px-4 sm:py-2.5'
        }`}
      >
        <Check className="h-5 w-5" />
        {!compact && <span className="hidden sm:inline">Baixado</span>}
      </span>
    )
  }

  if (progress !== undefined) {
    return (
      <span
        className={`flex items-center gap-2 rounded-lg border border-brand-400/30 bg-brand-500/10 font-medium text-brand-200 tabular-nums ${
          compact ? 'p-2.5' : 'p-2.5 sm:px-4 sm:py-2.5'
        }`}
      >
        <Download className="h-5 w-5 animate-pulse motion-reduce:animate-none" />
        {!compact && <span className="hidden sm:inline">Baixando... {progress}%</span>}
        {compact && `${progress}%`}
      </span>
    )
  }

  return (
    <button
      onClick={() => client && start(client, profileId, kind, String(id), ext, name, image, seriesId)}
      disabled={!client}
      title={failed ? 'Falhou — toque para tentar de novo' : 'Baixar para ver offline'}
      className={`flex items-center gap-2 rounded-lg border font-medium transition-all disabled:opacity-50 ${
        failed
          ? 'border-rose-500/40 bg-rose-950/30 text-rose-300 hover:bg-rose-950/50'
          : 'border-zinc-800 bg-zinc-900/70 text-white hover:border-brand-500/40 hover:bg-zinc-800'
      } ${compact ? 'p-2.5' : 'p-2.5 sm:px-4 sm:py-2.5'}`}
    >
      <Download className="h-5 w-5" />
      {!compact && <span className="hidden sm:inline">{failed ? 'Tentar de novo' : 'Baixar para ver offline'}</span>}
    </button>
  )
}
