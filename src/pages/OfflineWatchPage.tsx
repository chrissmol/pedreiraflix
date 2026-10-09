import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import VideoPlayer from '../components/VideoPlayer'
import { nativeDownloads, nativeFileSrc } from '../lib/nativeDownloads'
import { getDownload, getDownloadBlob } from '../lib/offlineStore'
import type { DownloadRecord } from '../lib/offlineStore'
import { useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'
import PageLoading from '../components/PageLoading'

interface OfflineWatchPageProps {
  /** The IndexedDB record key, `${profileId}:${kind}-${id}` — see store/downloads.ts. */
  downloadKey: string
}

/** Plays a downloaded title straight from IndexedDB via a Blob URL — no network involved at all, so
 * this works with the device fully offline. Progress/watched status is saved under the title's own
 * underlying kind/id (not a separate "offline" bucket), so it's shared with the online playback of the
 * same title: resume where you left off either way. */
export default function OfflineWatchPage({ downloadKey }: OfflineWatchPageProps) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const profileId = useActiveProfileId()
  const setProgress = useLibraryStore((s) => s.setProgress)
  const removeProgress = useLibraryStore((s) => s.removeProgress)
  const markWatched = useLibraryStore((s) => s.markWatched)
  const lastSaved = useRef(0)

  const [record, setRecord] = useState<DownloadRecord | null | undefined>(undefined) // undefined = loading, null = not found
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  // Keyed off the loaded record's own kind/id (not parsed back out of `downloadKey`, whose profileId
  // segment can itself contain a ':' for a pre-profiles migrated session — splitting on ':' would grab
  // the wrong piece in that case) — undefined until the record loads, which just misses harmlessly.
  const existingProgress = useLibraryStore((s) => (record ? s.progress[`${profileId}:${record.kind}-${record.id}`] : undefined))

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    getDownload(downloadKey)
      .then(async (r) => {
        // Baixado pelo Android (APK): o arquivo esta na pasta do app, tocado direto de la.
        if (r?.nativeId != null && nativeDownloads) {
          const [st] = (await nativeDownloads.status({ ids: [r.nativeId] })).downloads
          if (cancelled) return
          if (st?.state === 'done' && st.uri) setObjectUrl(nativeFileSrc(st.uri))
          setRecord(st?.state === 'done' ? r : null)
          return
        }
        const blob = r ? await getDownloadBlob(r) : null
        if (cancelled) return
        if (blob) {
          url = URL.createObjectURL(blob)
          setObjectUrl(url)
        }
        setRecord(r ?? null)
      })
      .catch(() => setRecord(null))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [downloadKey])

  if (record === undefined) return <PageLoading label="Carregando download" />
  if (!record || !objectUrl) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <p className="text-on-surface-variant">Este download não foi encontrado neste aparelho.</p>
        <button onClick={() => navigate('/downloads')} className="btn-secondary">
          Ver downloads
        </button>
      </div>
    )
  }

  const r = record // a plain local alias narrows cleanly inside the closure below; `record` itself doesn't
  const progressKey = `${r.kind}-${r.id}`

  function handleProgress(current: number, duration: number) {
    if (!duration) return
    const now = Date.now()
    if (now - lastSaved.current < 5000) return
    lastSaved.current = now
    if (current / duration > 0.95) {
      removeProgress(profileId, progressKey)
      markWatched(profileId, progressKey)
      return
    }
    setProgress(profileId, {
      kind: r.kind,
      id: r.id,
      name: r.name,
      image: r.image,
      ext: 'mp4',
      positionSeconds: current,
      durationSeconds: duration,
      updatedAt: now,
      seriesId: r.seriesId,
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <VideoPlayer
        src={objectUrl}
        isHls={false}
        isLive={false}
        title={params.get('name') || record.name}
        subtitle="Baixado · assistindo offline"
        poster={record.image}
        onBack={() => navigate(-1)}
        startAt={existingProgress?.positionSeconds ?? 0}
        onProgress={handleProgress}
        onEnded={() => markWatched(profileId, progressKey)}
      />
    </div>
  )
}
