import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import PosterCard from './PosterCard'
import Row from './Row'
import { progressFor, useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'

interface ContinueWatchingRowProps {
  /** Restricts the row to one kind (Filmes/Séries pages); omit to show everything (Home). */
  kind?: 'movie' | 'series'
}

/** Purely local data (localStorage), so it renders instantly regardless of how long the catalog
 * itself takes to load from the provider — it's deliberately the first thing on screen. */
export default function ContinueWatchingRow({ kind }: ContinueWatchingRowProps) {
  const navigate = useNavigate()
  const profileId = useActiveProfileId()
  const progressRecord = useLibraryStore((s) => s.progress)
  const removeProgress = useLibraryStore((s) => s.removeProgress)

  const items = useMemo(
    () =>
      progressFor(progressRecord, profileId)
        .filter((p) => !kind || p.kind === kind)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [progressRecord, profileId, kind],
  )

  if (items.length === 0) return null

  return (
    <Row title="Continuar assistindo">
      {items.map((p) => (
        <div key={`${p.kind}-${p.id}`} className="group relative shrink-0">
          <PosterCard
            title={p.name}
            image={p.image}
            onClick={() =>
              navigate(
                `/watch/${p.kind}/${p.id}?ext=${p.ext || 'mp4'}&name=${encodeURIComponent(
                  p.name,
                )}&image=${encodeURIComponent(p.image || '')}${p.seriesId ? `&seriesId=${p.seriesId}` : ''}`,
              )
            }
            subtitle={`${Math.round((p.positionSeconds / (p.durationSeconds || 1)) * 100)}% assistido`}
            progressPct={(p.positionSeconds / (p.durationSeconds || 1)) * 100}
          />
          <button
            onClick={(e) => {
              e.stopPropagation()
              removeProgress(profileId, `${p.kind}-${p.id}`)
            }}
            className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-white hover:bg-black pointer-fine:hidden pointer-fine:group-hover:flex"
            title="Remover de continuar assistindo"
          >
            ✕
          </button>
        </div>
      ))}
    </Row>
  )
}
