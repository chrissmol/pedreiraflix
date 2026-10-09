import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Download, Trash } from '../components/icons'
import ConfirmDialog from '../components/ConfirmDialog'
import PosterCard from '../components/PosterCard'
import Row from '../components/Row'
import { useDownloadsFor, useDownloadsStore } from '../store/downloads'
import { useActiveProfileId } from '../store/profiles'

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb < 1 ? mb.toFixed(1) : Math.round(mb)} MB`
}

export default function DownloadsPage() {
  const navigate = useNavigate()
  const profileId = useActiveProfileId()
  const downloads = useDownloadsFor(profileId)
  const refresh = useDownloadsStore((s) => s.refresh)
  const remove = useDownloadsStore((s) => s.remove)
  const [deleteKey, setDeleteKey] = useState<string | null>(null)

  useEffect(() => {
    refresh(profileId)
  }, [refresh, profileId])

  const totalBytes = downloads.reduce((sum, d) => sum + d.sizeBytes, 0)

  return (
    <div className="min-h-screen px-4 pt-[calc(6rem+env(safe-area-inset-top))] sm:px-10">
      <div className="mb-1 flex items-center gap-2">
        <Download className="h-7 w-7 text-brand-400" />
        <h1 className="font-display text-headline-md text-white sm:text-headline-lg">Downloads</h1>
      </div>
      <p className="mb-8 text-body-md text-on-surface-variant">
        {downloads.length === 0
          ? 'Nada baixado neste perfil ainda.'
          : `${downloads.length} título${downloads.length > 1 ? 's' : ''} · ${formatSize(totalBytes)} usados neste aparelho`}
      </p>

      {downloads.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">
          Toque em "Baixar para ver offline" na página de um filme ou episódio pra ele aparecer aqui.
        </p>
      ) : (
        <Row title="Baixados">
          {downloads.map((d) => (
            <div key={d.key} className="group relative shrink-0">
              <PosterCard
                title={d.name}
                image={d.image}
                onClick={() => navigate(`/watch/offline/${encodeURIComponent(d.key)}?name=${encodeURIComponent(d.name)}`)}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteKey(d.key)
                }}
                aria-label={`Excluir download de ${d.name}`}
                className="absolute right-1.5 top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-sm hover:bg-live"
              >
                <Trash className="h-4 w-4" />
              </button>
              <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-label-badge text-white backdrop-blur-sm">
                {formatSize(d.sizeBytes)}
              </span>
            </div>
          ))}
        </Row>
      )}

      <button
        onClick={() => navigate('/')}
        className="btn-secondary mt-6"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar ao início
      </button>

      {deleteKey &&
        (() => {
          const d = downloads.find((x) => x.key === deleteKey)
          if (!d) return null
          return (
            <ConfirmDialog
              message={`Excluir "${d.name}" dos downloads? (${formatSize(d.sizeBytes)})`}
              onCancel={() => setDeleteKey(null)}
              onConfirm={() => {
                remove(profileId, d.key)
                setDeleteKey(null)
              }}
            />
          )
        })()}
    </div>
  )
}
