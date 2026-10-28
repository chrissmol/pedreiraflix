import { displayTitle, episodeName } from './displayTitle'
import type { JuntoRef } from './junto'
import type { ProviderClient } from './provider'
import { searchKey } from './search'

// Cada provedor enfeita o nome do seu jeito ("Matrix", "Matrix (1999)", "BR - Matrix [4K]"): o titulo da sala so e o
// mesmo filme se comparado sem ano, sem tag de qualidade/idioma e sem pontuacao.
const NOISE = /\b(4k|uhd|fhd|hd|sd|hdr|h265|dublado|dub|legendado|leg|dual|nacional)\b/g
const loose = (name: string) =>
  searchKey(displayTitle(name).replace(/\(\s*(?:19|20)\d{2}\s*\)/g, ' ').replace(/^\s*(?:pt\s*-?\s*br|br|pt)\s*[-|:]\s*/i, ''))
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
/** Os itens do catalogo que sao o titulo da sala: pelo nome exato (so pontuacao/acento) e, se nao houver, pelo nome sem enfeites. */
export function matchTitle<T extends { name: string }>(list: T[], title: string): T[] {
  const exact = list.filter((x) => searchKey(displayTitle(x.name)) === searchKey(displayTitle(title)))
  if (exact.length) return exact
  const want = loose(title)
  return want ? list.filter((x) => loose(x.name) === want) : []
}

// O catalogo inteiro e pesado: o mesmo titulo (play, pausa e pulo repetem o pedido) so e procurado uma vez por conta.
const lists = new WeakMap<ProviderClient, Map<string, Promise<{ name: string }[]>>>()
function catalog(client: ProviderClient, kind: JuntoRef['k']): Promise<any[]> {
  let m = lists.get(client)
  if (!m) lists.set(client, (m = new Map()))
  let p = m.get(kind)
  if (!p) {
    p = kind === 'series' ? client.getSeries() : kind === 'movie' ? client.getVodStreams() : client.getLiveStreams()
    m.set(kind, p)
    p.catch(() => m.delete(kind))
  }
  return p
}
/** Ao entrar na sala o catalogo ja vem para a memoria: o primeiro titulo da sala nao espera o download. */
export const warmCatalog = (client: ProviderClient) => {
  for (const k of ['movie', 'series'] as const) catalog(client, k).catch(() => {})
}

const found = new WeakMap<ProviderClient, Map<string, string>>()

/** Ids de filme, serie e canal sao do provedor de cada conta: o caminho da sala so serve a quem tem o mesmo provedor.
 * Aqui o titulo da sala vira o caminho da propria conta. Se o caminho do anfitriao ja e de um item de mesmo nome neste
 * catalogo (mesmo provedor, ou a versao exata), ele e mantido. null = esta conta nao tem o titulo. */
export async function resolveRef(client: ProviderClient, ref: JuntoRef, hostPath: string): Promise<string | null> {
  const id = `${ref.k}|${ref.t}|${ref.s ?? ''}|${ref.e ?? ''}|${hostPath}`
  let cache = found.get(client)
  if (!cache) found.set(client, (cache = new Map()))
  const known = cache.get(id)
  if (known) return known
  const path = await search(client, ref, hostPath)
  if (path) cache.set(id, path)
  return path
}

async function search(client: ProviderClient, ref: JuntoRef, hostPath: string): Promise<string | null> {
  const hostId = Number(hostPath.match(/^\/watch\/\w+\/(\d+)/)?.[1])
  if (ref.k === 'series') {
    const list = matchTitle(await catalog(client, 'series'), ref.t)
    for (const item of list) {
      const details = await client.getSeriesInfo(item.seriesId)
      const ep = details.seasons.find((s) => s.seasonNumber === ref.s)?.episodes.find((e) => e.episodeNum === ref.e)
      if (ep) return `/watch/series/${ep.id}?ext=${ep.containerExtension}&name=${encodeURIComponent(episodeName(details.name, ep.title))}&image=${encodeURIComponent(details.cover || '')}&seriesId=${details.seriesId}`
    }
    return null
  }
  if (ref.k === 'movie') {
    const list = matchTitle(await catalog(client, 'movie'), ref.t)
    const m = list.find((x) => x.streamId === hostId) ?? list[0]
    return m ? `/watch/movie/${m.streamId}?ext=${m.containerExtension}&name=${encodeURIComponent(m.name)}` : null
  }
  const list = matchTitle(await catalog(client, 'live'), ref.t)
  const c = list.find((x) => x.streamId === hostId) ?? list[0]
  return c ? `/watch/live/${c.streamId}?name=${encodeURIComponent(c.name)}` : null
}
