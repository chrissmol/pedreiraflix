import { cached } from './cache'
import { displayTitle } from './displayTitle'
import { searchKey } from './search'

/** Titulos que a IA do Worker (/api/sugestoes) acha que combinam com uma frase ou com um titulo. Sem IA, cota do dia
 * acabada ou erro: lista vazia (e nao fica no cache, entao volta a tentar depois). */
export function aiTitles(params: { q: string } | { like: string; kind: 'movie' | 'tv' }): Promise<string[]> {
  const qs = new URLSearchParams(params)
  return cached(`sugestoes:${qs}`, async () => {
    const res = await fetch(`/api/sugestoes?${qs}`)
    if (res.status !== 200) throw new Error('sem sugestoes')
    return ((await res.json()) as { titles: string[] }).titles
  }).catch(() => [])
}

// "Interestelar (2014) [4K]" e "interestelar" sao o mesmo titulo; o ano e os enfeites do provedor nao contam.
const titleKey = (name: string) => searchKey(displayTitle(name).replace(/\(\d{4}\)/g, ''))

/** Acha no catalogo os titulos sugeridos, pelo nome exato (sem acento, enfeites e ano), na ordem da sugestao. */
export function findInCatalog<T extends { name: string }>(groups: { items: T[] }[], titles: string[]): T[] {
  if (titles.length === 0) return []
  const byKey = new Map<string, T>()
  for (const g of groups) for (const item of g.items) if (!byKey.has(titleKey(item.name))) byKey.set(titleKey(item.name), item)
  const found = titles.map((t) => byKey.get(titleKey(t))).filter((x): x is T => !!x)
  return [...new Set(found)]
}

/** Nomes em alta na semana pelo TMDB (/api/em-alta). Sem token ou erro: lista vazia e a fileira nao aparece. */
export function trendingTitles(kind: 'movie' | 'tv'): Promise<string[]> {
  return cached(`em-alta:${kind}`, async () => {
    const res = await fetch(`/api/em-alta?kind=${kind}`)
    if (res.status !== 200) throw new Error('sem em alta')
    return ((await res.json()) as { titles: string[] }).titles
  }).catch(() => [])
}
