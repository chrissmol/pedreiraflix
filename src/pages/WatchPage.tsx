import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BlockedByProfile from '../components/BlockedByProfile'
import VideoPlayer from '../components/VideoPlayer'
import { useXtream } from '../hooks/useXtream'
import { cached } from '../lib/cache'
import { formatEpgTime, useShortEpg } from '../hooks/useShortEpg'
import { isCategoryBlocked } from '../lib/parentalControl'
import OfflineWatchPage from './OfflineWatchPage'
import { useLibraryStore } from '../store/library'
import { useActiveProfile, useActiveProfileId } from '../store/profiles'
import type { Episode, LiveChannel, SeriesDetails } from '../types'
import PageLoading from '../components/PageLoading'

/** Flattens every season into one ordered episode list, so "next episode" can just look at the following index. */
function flattenEpisodes(details: SeriesDetails): Episode[] {
  return [...details.seasons]
    .sort((a, b) => a.seasonNumber - b.seasonNumber)
    .flatMap((s) => s.episodes)
}

// A distinct component (not a branch inside the online player below) because it needs none of that
// component's network-fetching hooks — and hooks can't be called conditionally, so this has to be a
// real separate component, picked before any of those hooks run, not an early return partway through.
export default function WatchPage() {
  const { kind, id } = useParams<{ kind: 'live' | 'movie' | 'series' | 'offline'; id: string }>()
  if (kind === 'offline' && id) return <OfflineWatchPage downloadKey={decodeURIComponent(id)} />
  return <OnlineWatchPage kind={kind} id={id} />
}

function OnlineWatchPage({ kind, id }: { kind?: 'live' | 'movie' | 'series' | 'offline'; id?: string }) {
  const [params] = useSearchParams()
  const client = useXtream()
  const navigate = useNavigate()
  const profileId = useActiveProfileId()
  const isKids = Boolean(useActiveProfile()?.isKids)
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

  // Catch-up/rewind: a live channel watched from the EPG grid ("Assistir de novo"), fixed-length and
  // seekable like VOD instead of an endless live stream. See EpgGuidePage.tsx.
  const catchupStart = kind === 'live' ? Number(cleanParam(params.get('start')) || 0) || null : null
  const catchupDurationMin = Number(cleanParam(params.get('duration')) || 0) || null
  const isCatchup = catchupStart != null

  const src = useMemo(() => {
    if (!client || !kind || !id || kind === 'offline') return null // 'offline' never actually reaches here — see the dispatcher in the default export below
    if (isCatchup && catchupStart && catchupDurationMin) return client.timeshiftUrl(Number(id), catchupStart, catchupDurationMin)
    return client.streamUrl(kind, id, ext)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, kind, id, ext, isCatchup, catchupStart, catchupDurationMin])

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

  // Direct link/bookmark/deep link guard — the catalog lists themselves already hide adult categories
  // for a kids profile, but someone could still land here straight from a URL that bypasses them.
  const [blocked, setBlocked] = useState(false)
  // Starts true for a kids profile: playback must not start even for the instant it'd take the check
  // below to resolve, and this flips back to false immediately for every other profile.
  const [checkingProfile, setCheckingProfile] = useState(isKids)
  useEffect(() => {
    if (!client || !kind || !id || !isKids || kind === 'offline') {
      setBlocked(false)
      setCheckingProfile(false)
      return
    }
    // Wait for the data each kind's category lookup depends on, rather than checking too early and
    // momentarily deciding "not blocked" before it's actually loaded.
    if (kind === 'live' && liveChannels.length === 0) return
    if (kind === 'series' && !seriesDetails) return
    setCheckingProfile(true)
    let cancelled = false
    const watchKind = kind
    async function check() {
      let categoryId: string | null | undefined
      if (watchKind === 'live') categoryId = liveChannels.find((c) => c.streamId === Number(id))?.categoryId
      else if (watchKind === 'series') categoryId = seriesDetails?.categoryId
      else categoryId = (await cached(`movie-info:${id}`, () => client!.getVodInfo(Number(id)))).categoryId
      if (cancelled) return
      setBlocked(await isCategoryBlocked(client!, watchKind, categoryId))
      setCheckingProfile(false)
    }
    check().catch(() => setCheckingProfile(false))
    return () => {
      cancelled = true
    }
  }, [client, kind, id, isKids, liveChannels, seriesDetails])

  const nextEpisode = useMemo(() => {
    if (!seriesDetails || kind !== 'series') return null
    const episodes = flattenEpisodes(seriesDetails)
    const index = episodes.findIndex((e) => e.id === id)
    if (index === -1) return episodes[0] ?? null
    return episodes[index + 1] ?? null
  }, [seriesDetails, kind, id])

  // Episodio anterior: null no primeiro da serie (e quando o episodio nao foi achado na lista).
  const previousEpisode = useMemo(() => {
    if (!seriesDetails || kind !== 'series') return null
    const episodes = flattenEpisodes(seriesDetails)
    const index = episodes.findIndex((e) => e.id === id)
    return index > 0 ? episodes[index - 1] : null
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

  if (!src || checkingProfile) return <PageLoading label="Carregando player" />
  if (blocked) return <BlockedByProfile />

  const subtitle = isCatchup
    ? `Catch-up · ${catchupStart ? new Date(catchupStart * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}`
    : kind === 'live' && current
      ? `AGORA ${formatEpgTime(current.start)}-${formatEpgTime(current.end)} ${current.title}${nextProgram ? ` · A seguir: ${nextProgram.title}` : ''}`
      : isLikelyUnsupportedContainer
        ? `Formato .${ext} pode não ser suportado pelo navegador (comum em .mkv/.avi).`
        : undefined

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <VideoPlayer
        src={src}
        isHls={isHls}
        isLive={kind === 'live' && !isCatchup}
        title={name}
        subtitle={subtitle}
        poster={image}
        onBack={() => navigate(-1)}
        startAt={kind !== 'live' ? existingProgress?.positionSeconds ?? 0 : 0}
        onProgress={handleProgress}
        onEnded={handleEnded}
        next={nextEpisode ? { label: `${nextEpisode.title}`, onPlay: () => goToEpisode(nextEpisode) } : null}
        previous={previousEpisode ? { label: previousEpisode.title, onPlay: () => goToEpisode(previousEpisode) } : null}
        onChannelUp={kind === 'live' && !isCatchup && liveChannels.length > 1 ? zapNext : undefined}
        onChannelDown={kind === 'live' && !isCatchup && liveChannels.length > 1 ? zapPrev : undefined}
      />
    </div>
  )
}
