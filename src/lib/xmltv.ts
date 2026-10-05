import type { EpgProgram } from '../types'

// One in-flight/parsed guide per URL for the lifetime of the page: the grid asks for every visible
// channel at once, and an XMLTV document holds the whole lineup, so without this the same multi-megabyte
// file would be downloaded and parsed once per channel.
// ponytail: parsed whole, in memory, on the main thread — fine for the usual few-MB guide. If a provider
// ships a 50MB one and the UI stutters while it parses, the upgrade path is a Web Worker, not a cache.
const guides = new Map<string, Promise<Map<string, EpgProgram[]>>>()

/** Downloads and parses the playlist's XMLTV guide, through the same proxy the playlist itself uses (the
 * EPG host is usually the provider's, with the same certificate/CORS problems). Any failure resolves to
 * an empty guide — a missing EPG is not an error worth breaking the channel list over — and is not kept,
 * so a later attempt can still succeed. */
export function loadXmltv(url: string): Promise<Map<string, EpgProgram[]>> {
  const cached = guides.get(url)
  if (cached) return cached

  const pending = (async () => {
    const res = await fetch(`/api/stream?raw=1&url=${encodeURIComponent(url)}`)
    if (!res.ok) throw new Error(`EPG ${res.status}`)
    // Guides are very often served as .xml.gz. The browser only unzips what it negotiated itself, so a
    // body that is gzip because of the file name has to be decompressed here.
    const gzipped = /\.gz(\?|$)/i.test(url) && res.body
    const text = gzipped ? await new Response(res.body!.pipeThrough(new DecompressionStream('gzip'))).text() : await res.text()
    return parseXmltv(text)
  })().catch(() => {
    guides.delete(url)
    return new Map<string, EpgProgram[]>()
  })

  guides.set(url, pending)
  return pending
}

/** XMLTV timestamps are `YYYYMMDDHHMMSS` plus an optional ` +HHMM` offset. Without the offset the spec
 * says it's the sender's local time, which in practice means the viewer's — exactly what `Date` does with
 * separate components, so that's the fallback. */
export function parseXmltvTime(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-])(\d{2})(\d{2}))?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s, sign, oh, om] = m
  const parts = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0)] as const
  if (!sign) {
    const local = new Date(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5])
    return Number.isNaN(local.getTime()) ? null : local
  }
  const offsetMinutes = (Number(oh) * 60 + Number(om)) * (sign === '-' ? -1 : 1)
  const utc = Date.UTC(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]) - offsetMinutes * 60_000
  return Number.isNaN(utc) ? null : new Date(utc)
}

/** The app renders `start`/`end` with `new Date(value.replace(' ', 'T'))`, which reads a string without a
 * zone as local time — so the wall-clock string has to be built from local parts, not `toISOString()`. */
function localStamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
}

/** Parses an XMLTV document into programs grouped by the `channel` attribute, which is what a playlist's
 * `tvg-id` points at. Uses the browser's own XML parser — no dependency, and a malformed document yields
 * an empty map instead of throwing, same as a provider with no EPG. */
export function parseXmltv(xml: string): Map<string, EpgProgram[]> {
  const byChannel = new Map<string, EpgProgram[]>()
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml')
  } catch {
    return byChannel
  }
  if (doc.querySelector('parsererror')) return byChannel

  for (const node of doc.querySelectorAll('programme')) {
    const channel = node.getAttribute('channel')
    const start = parseXmltvTime(node.getAttribute('start') || '')
    const stop = parseXmltvTime(node.getAttribute('stop') || '')
    if (!channel || !start || !stop) continue

    const list = byChannel.get(channel)
    const program: EpgProgram = {
      id: `${channel}-${start.getTime()}`,
      title: node.querySelector('title')?.textContent?.trim() || 'Sem título',
      description: node.querySelector('desc')?.textContent?.trim() || '',
      start: localStamp(start),
      end: localStamp(stop),
      startTimestamp: Math.floor(start.getTime() / 1000),
      endTimestamp: Math.floor(stop.getTime() / 1000),
      // XMLTV describes the schedule, never whether a past program is still retrievable — that's a
      // provider capability, and an M3U playlist exposes none.
      hasArchive: false,
    }
    if (list) list.push(program)
    else byChannel.set(channel, [program])
  }

  for (const list of byChannel.values()) list.sort((a, b) => (a.startTimestamp ?? 0) - (b.startTimestamp ?? 0))
  return byChannel
}
