import { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import VideoPlayer from '../components/VideoPlayer'
import { useXtream } from '../hooks/useXtream'
import { formatEpgTime, useShortEpg } from '../hooks/useShortEpg'
import { useLibraryStore } from '../store/library'

export default function WatchPage() {
  const { kind, id } = useParams<{ kind: 'live' | 'movie' | 'series'; id: string }>()
  const [params] = useSearchParams()
  const client = useXtream()
  const navigate = useNavigate()
  const setProgress = useLibraryStore((s) => s.setProgress)
  const removeProgress = useLibraryStore((s) => s.removeProgress)
  const markWatched = useLibraryStore((s) => s.markWatched)
  const existingProgress = useLibraryStore((s) => s.progress[`${kind}-${id}`])
  const lastSaved = useRef(0)

  // Guard against literal "undefined"/"null" strings ending up in the URL or
  // in progress entries persisted before a field existed — a plain `|| ''`
  // fallback chain treats those non-empty strings as valid values otherwise.
  function cleanParam(value: string | null | undefined): string | null {
    return value && value !== 'undefined' && value !== 'null' ? value : null
  }

  const ext = cleanParam(params.get('ext')) || cleanParam(existingProgress?.ext) || (kind === 'live' ? 'm3u8' : 'mp4')
  const name =
    cleanParam(params.get('name')) ||
    cleanParam(existingProgress?.name) ||
    `${kind === 'live' ? 'Canal' : 'Conteúdo'} ${id}`
  const image = cleanParam(params.get('image')) || cleanParam(existingProgress?.image) || null

  const isHls = ext === 'm3u8'
  const isLikelyUnsupportedContainer = !isHls && !['mp4', 'webm', 'ts'].includes(ext.toLowerCase())

  const src = useMemo(() => {
    if (!client || !kind || !id) return null
    return client.streamUrl(kind, id, ext)
  }, [client, kind, id, ext])

  // Stops pull-to-refresh / scroll chaining from reaching the page behind the player on phones.
  useEffect(() => {
    const root = document.documentElement
    root.style.overscrollBehavior = 'none'
    return () => {
      root.style.overscrollBehavior = ''
    }
  }, [])

  const epgStreamId = kind === 'live' && id ? Number(id) : null
  const { current, next } = useShortEpg(epgStreamId)

  function handleProgress(current: number, duration: number) {
    if (!id || (kind !== 'movie' && kind !== 'series') || !duration) return
    const now = Date.now()
    if (now - lastSaved.current < 5000) return
    lastSaved.current = now
    // Treat anything past 95% as finished so it drops out of "continue watching"
    // instead of lingering at "100%" forever.
    if (current / duration > 0.95) {
      removeProgress(`${kind}-${id}`)
      markWatched(`${kind}-${id}`)
      return
    }
    setProgress({
      kind,
      id,
      name,
      image,
      ext,
      positionSeconds: current,
      durationSeconds: duration,
      updatedAt: now,
    })
  }

  if (!src) return <div className="pt-32 text-center text-zinc-400">Carregando player...</div>

  const subtitle =
    kind === 'live' && current
      ? `AGORA ${formatEpgTime(current.start)}-${formatEpgTime(current.end)} ${current.title}${next ? ` · A seguir: ${next.title}` : ''}`
      : isLikelyUnsupportedContainer
        ? `Formato .${ext} pode não ser suportado pelo navegador (comum em .mkv/.avi).`
        : undefined

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <VideoPlayer
        src={src}
        isHls={isHls}
        isLive={kind === 'live'}
        title={name}
        subtitle={subtitle}
        onBack={() => navigate(-1)}
        startAt={kind !== 'live' ? existingProgress?.positionSeconds ?? 0 : 0}
        onProgress={handleProgress}
      />
    </div>
  )
}
