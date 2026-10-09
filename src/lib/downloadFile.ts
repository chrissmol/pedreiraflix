import { estimateStorage, PART_BYTES, putPart } from './offlineStore'

// Download no navegador/app do Windows: o filme vem em pedacos (Range) de PART_BYTES — o mesmo tipo de pedido que o
// proprio player faz ao tocar, e que provedores e o Cloudflare aceitam melhor que uma unica resposta de GBs. Cada
// pedaco tenta de novo se falhar, o progresso e real (o total vem do Content-Range) e uma resposta que nao e video
// (a pagina de erro/bloqueio do provedor) nunca e gravada como se fosse o filme (Windows do amigo do Christian,
// 09/10: arquivo de "0 MB" que dava erro ao tocar).

/** Erro com mensagem pronta para mostrar no botao. */
export class DownloadError extends Error {}

const NOT_VIDEO = /^(text\/|application\/(json|xml|xhtml))/
const RETRY_STATUSES = new Set([429, 502, 503, 504])
const TRIES = 3

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function checkResponse(res: Response) {
  if (res.status === 416) return // pediu depois do fim: o arquivo ja acabou
  if (!res.ok) {
    throw new DownloadError(
      res.status === 403 || res.status === 401
        ? `O provedor recusou o download (HTTP ${res.status}). Pode ser o limite de telas.`
        : `O provedor não entregou o vídeo (HTTP ${res.status}).`,
    )
  }
  const type = (res.headers.get('content-type') || '').toLowerCase()
  if (NOT_VIDEO.test(type)) {
    throw new DownloadError('O provedor respondeu uma página em vez do vídeo (bloqueio ou erro do provedor).')
  }
}

async function fetchRange(url: string, start: number): Promise<Response> {
  let last: unknown
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { range: `bytes=${start}-${start + PART_BYTES - 1}` } })
      if (!RETRY_STATUSES.has(res.status) || attempt === TRIES) return res
      await res.body?.cancel()
    } catch (err) {
      last = err
      if (attempt === TRIES) break
    }
    await sleep(800 * attempt)
  }
  throw new DownloadError(last ? 'Sem conexão com o servidor. Tente de novo.' : 'O provedor não respondeu. Tente de novo.')
}

/** Baixa `url` para o IndexedDB em partes (store `parts`). Devolve o tamanho, o numero de partes e o tipo. */
export async function downloadToParts(url: string, key: string, onProgress: (pct: number) => void) {
  let received = 0
  let total = 0
  let parts = 0
  let contentType = 'video/mp4'
  let spaceChecked = false

  const checkSpace = async () => {
    if (spaceChecked || total <= 0) return
    spaceChecked = true
    const storage = await estimateStorage()
    if (storage && total > storage.quotaBytes - storage.usageBytes) throw new DownloadError('Sem espaço no aparelho para este vídeo')
  }
  const report = () => total > 0 && onProgress(Math.min(99, Math.round((received / total) * 100))) // 100 so depois de salvo

  for (;;) {
    const res = await fetchRange(url, received)
    checkResponse(res)
    contentType = res.headers.get('content-type') || contentType
    if (res.status === 416) break

    if (res.status === 200) {
      // O servidor ignorou o Range e mandou o arquivo todo: le essa resposta inteira em partes, como antes.
      if (received > 0) throw new DownloadError('O servidor não retoma downloads. Tente de novo.')
      total = Number(res.headers.get('content-length')) || 0
      await checkSpace()
      const reader = res.body!.getReader()
      let chunks: Uint8Array[] = []
      let buffered = 0
      const flush = async () => {
        if (!buffered) return
        await putPart(key, parts++, new Blob(chunks as BlobPart[], { type: contentType }))
        chunks = []
        buffered = 0
      }
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.length
        for (let rest = value; rest.length; ) {
          const piece = rest.subarray(0, PART_BYTES - buffered)
          chunks.push(piece)
          buffered += piece.length
          rest = rest.subarray(piece.length)
          if (buffered >= PART_BYTES) await flush()
        }
        report()
      }
      await flush()
      break
    }

    // 206: um pedaco. O Content-Range diz onde ele cai e quanto vale o arquivo todo.
    const m = res.headers.get('content-range')?.match(/bytes (\d+)-(\d+)\/(\d+|\*)/)
    if (!m || Number(m[1]) !== received) throw new DownloadError('Resposta inesperada do provedor. Tente de novo.')
    total = m[3] === '*' ? 0 : Number(m[3])
    await checkSpace()
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0) break
    await putPart(key, parts++, new Blob([bytes], { type: contentType }))
    received += bytes.length
    report()
    if (total > 0 ? received >= total : bytes.length < PART_BYTES) break
  }

  if (received < 4096) throw new DownloadError('O provedor devolveu um arquivo vazio ou inválido.')
  return { received, parts, contentType }
}
