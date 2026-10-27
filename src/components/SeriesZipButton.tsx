import { useState } from 'react'
import { useXtream } from '../hooks/useXtream'
import { isTv } from '../lib/device'
import { episodeName } from '../lib/displayTitle'
import { nativeDownloads } from '../lib/nativeDownloads'
import { getDownload, getDownloadBlob } from '../lib/offlineStore'
import { buildZip, safeName, type ZipEntry } from '../lib/zip'
import { isDownloaded, useDownloadsFor, useDownloadsStore } from '../store/downloads'
import { useActiveProfileId } from '../store/profiles'
import type { SeriesDetails } from '../types'
import { Download, X } from './icons'

const pad = (n: number) => String(n).padStart(2, '0')

/** "Baixar série inteira (ZIP)": baixa o que falta de todas as temporadas (um por vez, pela mesma fila da
 * temporada) e junta tudo num .zip com uma pasta por temporada. No APK quem junta e o plugin nativo
 * (BaixadorPlugin.zip), que le os arquivos do Android sem passar pela memoria do app. */
export default function SeriesZipButton({ series }: { series: SeriesDetails }) {
  const client = useXtream()
  const profileId = useActiveProfileId()
  const downloads = useDownloadsFor(profileId)
  const queueKey = `${profileId}:season-${series.seriesId}-all`
  const running = useDownloadsStore((s) => s.seasons[queueKey])
  const startSeason = useDownloadsStore((s) => s.startSeason)
  const stopSeason = useDownloadsStore((s) => s.stopSeason)
  const [packing, setPacking] = useState(false)
  const [zipProgress, setZipProgress] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  // Episodios HLS (m3u8) nao baixam como arquivo (ver DownloadButton).
  const episodes = series.seasons.flatMap((s) => s.episodes).filter((ep) => ep.containerExtension !== 'm3u8')
  if (episodes.length === 0 || isTv) return null

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
        missing.map((ep) => ({ id: ep.id, ext: ep.containerExtension, name: episodeName(series.name, ep.title) })),
        series.cover,
      )
    }
    // A fila para no primeiro "provedor recusou": diz o motivo em vez de montar um zip incompleto sem avisar.
    const refused = missing.map((ep) => useDownloadsStore.getState().failed[`${profileId}:series-${ep.id}`]).find((m) => m?.startsWith('O provedor recusou'))
    if (refused) {
      setMessage(`${refused} Feche o canal ou outro aparelho com esta conta e toque de novo: o que já baixou fica guardado.`)
      return
    }
    setPacking(true)
    try {
      const root = safeName(series.name)
      const entries: (ZipEntry & { nativeId?: number })[] = []
      for (const ep of episodes) {
        const record = await getDownload(`${profileId}:series-${ep.id}`)
        if (!record || record.pending) continue
        const path = `${root}/Temporada ${pad(ep.season)}/${safeName(`E${pad(ep.episodeNum)} - ${ep.title}`)}.${ep.containerExtension || 'mp4'}`
        if (nativeDownloads) {
          if (record.nativeId != null) entries.push({ path, blob: new Blob(), nativeId: record.nativeId })
        } else {
          entries.push({ path, blob: await getDownloadBlob(record) })
        }
      }
      if (entries.length === 0) {
        setMessage('Nenhum episódio foi baixado. Tente de novo.')
        return
      }
      if (nativeDownloads) {
        const listener = await nativeDownloads.addListener('zipProgress', (p) => setZipProgress(`${p.done} de ${p.total}`))
        try {
          await nativeDownloads.zip({ ids: entries.map((e) => e.nativeId!), paths: entries.map((e) => e.path), fileName: `${root}.zip` })
        } finally {
          await listener.remove()
          setZipProgress('')
        }
        setMessage(entries.length < episodes.length ? `ZIP salvo com ${entries.length} de ${episodes.length} episódios.` : 'ZIP salvo.')
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
      const cancelled = (err instanceof DOMException && err.name === 'AbortError') || (err as Error)?.message === 'cancelado'
      if (!cancelled) setMessage('Não deu para montar o ZIP (pouco espaço ou memória no aparelho).')
    } finally {
      setPacking(false)
    }
  }

  if (running || packing) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span role="status" className="inline-flex items-center gap-2 text-label-md text-brand-300 tabular-nums">
          <Download className="h-4 w-4 animate-pulse motion-reduce:animate-none" />
          {packing ? `Montando o ZIP… ${zipProgress}` : `Baixando ${Math.min(running!.done + 1, running!.total)} de ${running!.total}`}
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
