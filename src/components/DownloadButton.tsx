import { useEffect } from 'react'
import { Check, Download } from './icons'
import { useXtream } from '../hooks/useXtream'
import { isDownloaded, useDownloadsFor, useDownloadsStore } from '../store/downloads'
import { useActiveProfileId } from '../store/profiles'
import { isTv } from '../lib/device'

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
  if (ext === 'm3u8' || isTv) return null

  if (done) {
    return (
      <span
        className={`${compact ? 'inline-flex h-10 w-10 items-center justify-center rounded-full' : 'btn-icon sm:w-auto sm:gap-2 sm:px-6 sm:text-label-md'} bg-done/15 text-done`}
      >
        <Check className="h-5 w-5" />
        {!compact && <span className="hidden sm:inline">Baixado</span>}
      </span>
    )
  }

  if (progress !== undefined) {
    return (
      <span
        className={`${compact ? 'inline-flex h-10 items-center justify-center gap-1 rounded-full px-2.5 text-label-badge' : 'btn-icon sm:w-auto sm:gap-2 sm:px-6 sm:text-label-md'} bg-brand-500/15 text-brand-300 tabular-nums`}
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
      title={failed || 'Baixar para ver offline'}
      aria-label={failed ? `${failed}. Tentar de novo` : 'Baixar para ver offline'}
      className={`${
        compact
          ? 'inline-flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-highest hover:text-white'
          : 'btn-icon sm:w-auto sm:gap-2 sm:px-6 sm:text-label-md'
      } disabled:opacity-50 ${failed ? 'text-live' : ''}`}
    >
      <Download className="h-5 w-5" />
      {!compact && <span className="hidden sm:inline">{failed ? (failed.startsWith('Sem espaço') ? 'Sem espaço' : 'Tentar de novo') : 'Baixar para ver offline'}</span>}
    </button>
  )
}
