import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import VideoPlayer from '../components/VideoPlayer'
import { useXtream } from '../hooks/useXtream'
import { cached } from '../lib/cache'
import { formatEpgTime, useShortEpg } from '../hooks/useShortEpg'
import { useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'
import type { Episode, LiveChannel, SeriesDetails } from '../types'

/** Flattens every season into one ordered episode list, so "next episode" can just look at the following index. */
function flattenEpisodes(details: SeriesDetails): Episode[] {
  return [...details.seasons]
    .sort((a, b) => a.seasonNumber - b.seasonNumber)
    .flatMap((s) => s.episodes)
}

export default function WatchPage() {
  const { kind, id } = useParams<{ kind: 'live' | 'movie' | 'series'; id: string }>()
  const [params] = useSearchParams()
  const client = useXtream()
  const navigate = useNavigate()
  const profileId = useActiveProfileId()
  const setProgress = useLibraryStore((s) => s.setProgress)
  const removeProgress = useLibraryStore((s) => s.removeProgress)
  const markWatched = useLibraryStore((s) => s.markWatched)
  const existingProgress = useLibraryStore((s) => s.progress[`${profileId}:${kind}-${id}`])
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
  const seriesId = Number(cleanParam(params.get('seriesId')) || existingProgress?.seriesId || 0) || null

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
  const { current, next: nextProgram } = useShortEpg(epgStreamId)

  // Live: the full channel list (every category, in catalog order) so arrow keys/swipe/buttons can zap.
  // Reuses the same cache keys as useLiveCatalog, so this is instant if Canais was already visited.
  const [liveChannels, setLiveChannels] = useState<LiveChannel[]>([])
  useEffect(() => {
    if (!client || kind !== 'live') return
    let cancelled = false
    async function load() {
      const categories = await cached('live:categories', () => client!.getLiveCategories())
      const lists = await Promise.all(
        categories.map((c) => cached(`live:items:${c.categoryId}`, () => client!.getLiveStreams(c.categoryId))),
      )
      if (!cancelled) setLiveChannels(lists.flat())
    }
    load().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [client, kind])

  // Memoized so identity stays stable across renders: VideoPlayer's keydown effect depends on these
  // callbacks and re-subscribes whenever they change, and a fresh closure on every render opened a
  // brief window with two listeners alive at once — a single Arrow key press could zap twice.
  const zap = useCallback(
    (direction: 1 | -1) => {
      if (liveChannels.length === 0) return
      const index = liveChannels.findIndex((c) => c.streamId === Number(id))
      const nextChannel = liveChannels[((index === -1 ? 0 : index) + direction + liveChannels.length) % liveChannels.length]
      if (nextChannel) navigate(`/watch/live/${nextChannel.streamId}?name=${encodeURIComponent(nextChannel.name)}`, { replace: true })
    },
    [liveChannels, id, navigate],
  )
  const zapNext = useCallback(() => zap(1), [zap])
  const zapPrev = useCallback(() => zap(-1), [zap])

  // Series: fetch the whole series once so we know which episode follows this one.
  const [seriesDetails, setSeriesDetails] = useState<SeriesDetails | null>(null)
  useEffect(() => {
    if (!client || kind !== 'series' || !seriesId) return
    let cancelled = false
    cached(`series-info:${seriesId}`, () => client.getSeriesInfo(seriesId))
      .then((data) => {
        if (!cancelled) setSeriesDetails(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [client, kind, seriesId])

  const nextEpisode = useMemo(() => {
    if (!seriesDetails || kind !== 'series') return null
    const episodes = flattenEpisodes(seriesDetails)
    const index = episodes.findIndex((e) => e.id === id)
    if (index === -1) return episodes[0] ?? null
    return episodes[index + 1] ?? null
  }, [seriesDetails, kind, id])

  function goToEpisode(ep: Episode) {
    if (!seriesDetails) return
    navigate(
      `/watch/series/${ep.id}?ext=${ep.containerExtension}&name=${encodeURIComponent(
        `${seriesDetails.name} - ${ep.title}`,
      )}&image=${encodeURIComponent(seriesDetails.cover || '')}&seriesId=${seriesDetails.seriesId}`,
      { replace: true },
    )
  }

  function handleProgress(current: number, duration: number) {
    if (!id || (kind !== 'movie' && kind !== 'series') || !duration) return
    const now = Date.now()
    if (now - lastSaved.current < 5000) return
    lastSaved.current = now
    // Treat anything past 95% as finished so it drops out of "continue watching"
    // instead of lingering at "100%" forever.
    if (current / duration > 0.95) {
      removeProgress(profileId, `${kind}-${id}`)
      markWatched(profileId, `${kind}-${id}`)
      return
    }
    setProgress(profileId, {
      kind,
      id,
      name,
      image,
      ext,
      positionSeconds: current,
      durationSeconds: duration,
      updatedAt: now,
      seriesId: kind === 'series' && seriesId ? seriesId : undefined,
    })
  }

  function handleEnded() {
    if (kind === 'series' && id) markWatched(profileId, `series-${id}`)
    if (nextEpisode) goToEpisode(nextEpisode)
  }

  if (!src) return <div className="pt-32 text-center text-zinc-400">Carregando player...</div>

  const subtitle =
    kind === 'live' && current
      ? `AGORA ${formatEpgTime(current.start)}-${formatEpgTime(current.end)} ${current.title}${nextProgram ? ` · A seguir: ${nextProgram.title}` : ''}`
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
        poster={image}
        onBack={() => navigate(-1)}
        startAt={kind !== 'live' ? existingProgress?.positionSeconds ?? 0 : 0}
        onProgress={handleProgress}
        onEnded={handleEnded}
        next={nextEpisode ? { label: `${nextEpisode.title}`, onPlay: () => goToEpisode(nextEpisode) } : null}
        onChannelUp={kind === 'live' && liveChannels.length > 1 ? zapNext : undefined}
        onChannelDown={kind === 'live' && liveChannels.length > 1 ? zapPrev : undefined}
      />
    </div>
  )
}
