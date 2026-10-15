// ZIP sem compressao ("store"): video ja e comprimido, entao so empacotar basta e nada vai para a memoria — os
// arquivos entram como Blob (o navegador le do disco na hora de gravar). ZIP64 so quando o arquivo/offset passa
// de 4 GB, para o Explorer/Archive Utility abrirem os zips comuns sem surpresa.
export interface ZipEntry {
  path: string
  blob: Blob
}

const TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

async function crc32(blob: Blob): Promise<number> {
  let crc = 0xffffffff
  const reader = blob.stream().getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    for (let i = 0; i < value.length; i++) crc = TABLE[(crc ^ value[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const MAX32 = 0xffffffff
const enc = new TextEncoder()

function dosDateTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

/** Monta o zip como um Blob (cabecalhos + os Blobs dos arquivos, sem copiar). */
/** `limit` so existe para o teste exercitar o ZIP64 sem gerar 4 GB. */
export async function buildZip(entries: ZipEntry[], onProgress?: (done: number, total: number) => void, limit = MAX32): Promise<Blob> {
  const { time, date } = dosDateTime(new Date())
  const parts: BlobPart[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const [i, { path, blob }] of entries.entries()) {
    const name = enc.encode(path)
    const crc = await crc32(blob)
    const big = blob.size >= limit
    const bigOffset = offset >= limit
    // Local: zip64 so se o tamanho pede. Central: tambem se o offset pede.
    const localExtra = big ? new Uint8Array(20) : new Uint8Array(0)
    if (big) {
      const v = new DataView(localExtra.buffer)
      v.setUint16(0, 1, true)
      v.setUint16(2, 16, true)
      v.setBigUint64(4, BigInt(blob.size), true)
      v.setBigUint64(12, BigInt(blob.size), true)
    }
    const local = new Uint8Array(30 + name.length + localExtra.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, big ? 45 : 20, true)
    lv.setUint16(6, 0x0800, true) // nomes em UTF-8
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, big ? MAX32 : blob.size, true)
    lv.setUint32(22, big ? MAX32 : blob.size, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, localExtra.length, true)
    local.set(name, 30)
    local.set(localExtra, 30 + name.length)

    const extraLen = (big ? 16 : 0) + (bigOffset ? 8 : 0)
    const centralExtra = new Uint8Array(extraLen ? 4 + extraLen : 0)
    if (extraLen) {
      const v = new DataView(centralExtra.buffer)
      v.setUint16(0, 1, true)
      v.setUint16(2, extraLen, true)
      let at = 4
      if (big) {
        v.setBigUint64(at, BigInt(blob.size), true)
        v.setBigUint64(at + 8, BigInt(blob.size), true)
        at += 16
      }
      if (bigOffset) v.setBigUint64(at, BigInt(offset), true)
    }
    const c = new Uint8Array(46 + name.length + centralExtra.length)
    const cv = new DataView(c.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 45, true)
    cv.setUint16(6, big || bigOffset ? 45 : 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, big ? MAX32 : blob.size, true)
    cv.setUint32(24, big ? MAX32 : blob.size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, centralExtra.length, true)
    cv.setUint32(42, bigOffset ? MAX32 : offset, true)
    c.set(name, 46)
    c.set(centralExtra, 46 + name.length)
    central.push(c)

    parts.push(local, blob)
    offset += local.length + blob.size
    onProgress?.(i + 1, entries.length)
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0)
  parts.push(...(central as BlobPart[]))
  const bigEnd = offset >= limit
  if (bigEnd) {
    const z = new Uint8Array(56 + 20)
    const v = new DataView(z.buffer)
    v.setUint32(0, 0x06064b50, true)
    v.setBigUint64(4, 44n, true)
    v.setUint16(12, 45, true)
    v.setUint16(14, 45, true)
    v.setBigUint64(24, BigInt(entries.length), true)
    v.setBigUint64(32, BigInt(entries.length), true)
    v.setBigUint64(40, BigInt(cdSize), true)
    v.setBigUint64(48, BigInt(offset), true)
    v.setUint32(56, 0x07064b50, true)
    v.setBigUint64(64, BigInt(offset + cdSize), true)
    v.setUint32(72, 1, true)
    parts.push(z)
  }
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, Math.min(entries.length, 0xffff), true)
  ev.setUint16(10, Math.min(entries.length, 0xffff), true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, bigEnd ? MAX32 : offset, true)
  parts.push(end)
  return new Blob(parts, { type: 'application/zip' })
}

/** Nome seguro para arquivo/pasta: sem barras, dois-pontos etc. (Windows e macOS rejeitam). */
export function safeName(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '') || 'sem nome'
}
