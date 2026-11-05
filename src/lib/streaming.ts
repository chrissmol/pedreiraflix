import { cached } from './cache'

/** Plataformas de streaming do Brasil. `tmdb` e o id do provedor no TMDB (watch providers, regiao BR); `match` pega
 * categorias do painel que ja trazem o nome da plataforma ("|NETFLIX|", "Disney+ Originais"). */
export const STREAMINGS = [
  { key: 'netflix', name: 'Netflix', tmdb: 8, color: '#e50914', match: /\bnetflix\b/i },
  { key: 'globoplay', name: 'Globoplay', tmdb: 307, color: '#f9423a', match: /\bglobo\s*play\b/i },
  { key: 'prime', name: 'Prime Video', tmdb: 119, color: '#00a8e1', match: /\b(prime\s*video|amazon)\b/i },
  { key: 'disney', name: 'Disney+', tmdb: 337, color: '#1a3cb0', match: /\bdisney\s*(\+|plus)/i },
  { key: 'max', name: 'Max', tmdb: 1899, color: '#5b2bd6', match: /\b(hbo\s*)?max\b|\bhbo\b/i },
  { key: 'apple', name: 'Apple TV+', tmdb: 350, color: '#6e6e73', match: /\bapple\s*tv/i },
  { key: 'paramount', name: 'Paramount+', tmdb: 531, color: '#0064ff', match: /\bparamount/i },
] as const

export type Streaming = (typeof STREAMINGS)[number]

export const streamingGroupId = (key: string) => `s:${key}`

/** Plataformas que o nome de uma categoria do provedor cita. */
export const streamingsInName = (name: string) => STREAMINGS.filter((s) => s.match.test(name)).map((s) => s.key)

/** tmdb_id -> chaves das plataformas que o TMDB diz ter o titulo no Brasil (/api/streaming). Vazio sem token ou com erro. */
export function streamingIndex(kind: 'movie' | 'series'): Promise<Record<number, string[]>> {
  return cached(`streaming:${kind}`, async () => {
    const index: Record<number, string[]> = {}
    let next = 0
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (next < STREAMINGS.length) {
          const s = STREAMINGS[next++]
          const res = await fetch(`/api/streaming?provider=${s.tmdb}&kind=${kind === 'movie' ? 'movie' : 'tv'}`).catch(() => null)
          if (res?.status !== 200) continue
          for (const id of ((await res.json()) as { ids: number[] }).ids) (index[id] ??= []).push(s.key)
        }
      }),
    )
    if (Object.keys(index).length === 0) throw new Error('sem streaming')
    return index
  }).catch(() => ({}))
}
