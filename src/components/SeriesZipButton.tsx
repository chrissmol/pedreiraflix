import { useState } from 'react'
import { useXtream } from '../hooks/useXtream'
import { isTv } from '../lib/device'
import { nativeDownloads } from '../lib/nativeDownloads'
import { getDownload, getDownloadBlob } from '../lib/offlineStore'
import { buildZip, safeName, type ZipEntry } from '../lib/zip'
import { isDownloaded, useDownloadsFor, useDownloadsStore } from '../store/downloads'
import { useActiveProfileId } from '../store/profiles'
import type { SeriesDetails } from '../types'
import { Download, X } from './icons'

const pad = (n: number) => String(n).padStart(2, '0')

/** "Baixar série inteira (ZIP)": baixa o que falta de todas as temporadas (um por vez, pela mesma fila da
 * temporada) e junta tudo num .zip com uma pasta por temporada. Fica fora do APK, onde o Android ja guarda
 * cada episodio como arquivo na pasta Downloads. */
export default function SeriesZipButton({ series }: { series: SeriesDetails }) {
  const client = useXtream()
  const profileId = useActiveProfileId()
  const downloads = useDownloadsFor(profileId)
  const queueKey = `${profileId}:season-${series.seriesId}-all`
  const running = useDownloadsStore((s) => s.seasons[queueKey])
  const startSeason = useDownloadsStore((s) => s.startSeason)
  const stopSeason = useDownloadsStore((s) => s.stopSeason)
  const [packing, setPacking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Episodios HLS (m3u8) nao baixam como arquivo (ver DownloadButton).
  const episodes = series.seasons.flatMap((s) => s.episodes).filter((ep) => ep.containerExtension !== 'm3u8')
  if (episodes.length === 0 || isTv || nativeDownloads) return null

  async function run() {
    if (!client) return
    setMessage(null)
    const missing = episodes.filter((ep) => !isDownloaded(profileId, 'series', ep.id, downloads))
    if (missing.length) {
      await startSeason(
        client,
        profileId,
        queueKey,
        series.seriesId,
        missing.map((ep) => ({ id: ep.id, ext: ep.containerExtension, name: `${series.name} - ${ep.title}` })),
        series.cover,
      )
    }
    setPacking(true)
    try {
      const root = safeName(series.name)
      const entries: ZipEntry[] = []
      for (const ep of episodes) {
        const record = await getDownload(`${profileId}:series-${ep.id}`)
        if (!record || record.pending) continue
        const folder = `Temporada ${pad(ep.season)}`
        entries.push({
          path: `${root}/${folder}/${safeName(`E${pad(ep.episodeNum)} - ${ep.title}`)}.${ep.containerExtension || 'mp4'}`,
          blob: await getDownloadBlob(record),
        })
      }
      if (entries.length === 0) {
        setMessage('Nenhum episódio foi baixado. Tente de novo.')
        return
      }
      const zip = await buildZip(entries)
      const fileName = `${root}.zip`
      const picker = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker
      if (picker) {
        const handle = await picker({ suggestedName: fileName, types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }] })
        const writable = await handle.createWritable()
        await writable.write(zip)
        await writable.close()
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(zip)
        a.download = fileName
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
      }
      setMessage(entries.length < episodes.length ? `ZIP salvo com ${entries.length} de ${episodes.length} episódios.` : 'ZIP salvo.')
    } catch (err) {
      // Fechar a janela de "salvar como" nao e erro.
      if (!(err instanceof DOMException && err.name === 'AbortError')) setMessage('Não deu para montar o ZIP (pouco espaço ou memória no aparelho).')
    } finally {
      setPacking(false)
    }
  }

  if (running || packing) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span role="status" className="inline-flex items-center gap-2 text-label-md text-brand-300 tabular-nums">
          <Download className="h-4 w-4 animate-pulse motion-reduce:animate-none" />
          {packing ? 'Montando o ZIP…' : `Baixando ${Math.min(running!.done + 1, running!.total)} de ${running!.total}`}
        </span>
        {!packing && (
          <button
            onClick={() => stopSeason(queueKey)}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-label-md text-on-surface-variant transition-colors hover:bg-surface-high hover:text-white"
          >
            <X className="h-4 w-4" /> Parar
          </button>
        )}
        <span className="w-full text-body-sm text-on-surface-muted">Mantenha o app aberto até terminar.</span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        onClick={() => void run()}
        disabled={!client}
        className="inline-flex items-center gap-2 rounded-full bg-surface-container px-4 py-2 text-label-md text-white transition-colors hover:bg-surface-high disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        Baixar série inteira (ZIP)
      </button>
      {message && (
        <span role="status" className="text-body-sm text-on-surface-muted">
          {message}
        </span>
      )}
    </div>
  )
}
