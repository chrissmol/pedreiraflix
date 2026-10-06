import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from './ConfirmDialog'
import PosterCard from './PosterCard'
import Row from './Row'
import { formatRemaining } from './videoPlayerUtils'
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
  const [removeTarget, setRemoveTarget] = useState<{ key: string; name: string } | null>(null)

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
            subtitle={formatRemaining(p.positionSeconds, p.durationSeconds)}
            progressPct={(p.positionSeconds / (p.durationSeconds || 1)) * 100}
          />
          <button
            onClick={(e) => {
              e.stopPropagation()
              setRemoveTarget({ key: `${p.kind}-${p.id}`, name: p.name })
            }}
            className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-label-badge text-white backdrop-blur-sm hover:bg-live"
            title="Remover de continuar assistindo"
          >
            ✕
          </button>
        </div>
      ))}

      {removeTarget && (
        <ConfirmDialog
          message={`Remover "${removeTarget.name}" de continuar assistindo?`}
          confirmLabel="Remover"
          onCancel={() => setRemoveTarget(null)}
          onConfirm={() => {
            removeProgress(profileId, removeTarget.key)
            setRemoveTarget(null)
          }}
        />
      )}
    </Row>
  )
}
