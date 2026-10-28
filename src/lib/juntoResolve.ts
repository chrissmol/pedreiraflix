import { displayTitle, episodeName } from './displayTitle'
import type { JuntoRef } from './junto'
import type { ProviderClient } from './provider'
import { normalizeText } from './search'

const key = (name: string) => normalizeText(displayTitle(name))

/** Ids de filme, serie e canal sao do provedor de cada conta: o caminho da sala so serve a quem tem o mesmo provedor.
 * Aqui o titulo da sala vira o caminho da propria conta. Se o caminho do anfitriao ja e de um item de mesmo nome neste
 * catalogo (mesmo provedor, ou a versao exata), ele e mantido. null = esta conta nao tem o titulo. */
export async function resolveRef(client: ProviderClient, ref: JuntoRef, hostPath: string): Promise<string | null> {
  const want = key(ref.t)
  const hostId = Number(hostPath.match(/^\/watch\/\w+\/(\d+)/)?.[1])
  if (ref.k === 'series') {
    const list = (await client.getSeries()).filter((x) => key(x.name) === want)
    for (const item of list) {
      const details = await client.getSeriesInfo(item.seriesId)
      const ep = details.seasons.find((s) => s.seasonNumber === ref.s)?.episodes.find((e) => e.episodeNum === ref.e)
      if (ep) return `/watch/series/${ep.id}?ext=${ep.containerExtension}&name=${encodeURIComponent(episodeName(details.name, ep.title))}&image=${encodeURIComponent(details.cover || '')}&seriesId=${details.seriesId}`
    }
    return null
  }
  if (ref.k === 'movie') {
    const list = (await client.getVodStreams()).filter((x) => key(x.name) === want)
    const m = list.find((x) => x.streamId === hostId) ?? list[0]
    return m ? `/watch/movie/${m.streamId}?ext=${m.containerExtension}&name=${encodeURIComponent(m.name)}` : null
  }
  const list = (await client.getLiveStreams()).filter((x) => key(x.name) === want)
  const c = list.find((x) => x.streamId === hostId) ?? list[0]
  return c ? `/watch/live/${c.streamId}?name=${encodeURIComponent(c.name)}` : null
}
