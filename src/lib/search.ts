import { displayTitle } from './displayTitle.ts'

/** Lowercases and strips accents so "Ação" matches a search for "acao". */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** True if every word in the query appears somewhere in the haystack, in any
 * order — so "futebol americano" and "americano futebol" both match a
 * haystack containing both words anywhere, not just as one exact phrase. */
export function matchesQuery(haystack: string, query: string): boolean {
  const normalizedHaystack = normalizeText(haystack)
  const words = normalizeText(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  return words.every((word) => normalizedHaystack.includes(word))
}

/** Sem acento, minusculo e pontuacao vira espaco: "Homem-Aranha" e "homem aranha" sao a mesma busca. */
export function searchKey(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim()
}

// O catalogo tem dezenas de milhares de nomes; normalizar todos a cada letra travava a TV.
const keyCache = new WeakMap<object, string>()
export function itemKey(item: { name: string }): string {
  let key = keyCache.get(item)
  if (key === undefined) {
    key = searchKey(displayTitle(item.name))
    keyCache.set(item, key)
  }
  return key
}

/** No maximo uma letra trocada, sobrando ou faltando. */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

/** "homen" acha "homem" e "aranhaa" acha "aranha"; palavra curta precisa estar certa. Tambem vale o comeco de uma
 * palavra ("vingadres" acha "vingadores ultimato" so pela parte digitada). */
function fuzzyWord(word: string, tokens: string[]): boolean {
  if (word.length < 4) return tokens.some((t) => t.startsWith(word))
  return tokens.some((t) => oneEditApart(word, t) || oneEditApart(word, t.slice(0, word.length)) || oneEditApart(word, t.slice(0, word.length + 1)))
}

/** Quanto menor, mais relevante. 0 nome igual, 1 nome comeca com a busca, 2 contem a frase, 3 todas as palavras em
 * qualquer ordem, 4 so a categoria bate. */
function rank(key: string, query: string, words: string[]): number {
  if (key === query) return 0
  if (key.startsWith(query)) return 1
  if (key.includes(query)) return 2
  if (words.every((w) => key.includes(w))) return 3
  return -1
}

export interface SearchHit<T> {
  item: T
  rank: number
}

/** Busca no catalogo com a mesma regra nas sugestoes e na pagina de resultados: nome primeiro (por relevancia), depois
 * itens que so batem pela categoria ("terror" traz os filmes da categoria Terror). Sem nenhum acerto, tenta de novo
 * aceitando um erro de digitacao por palavra. */
export function searchCatalog<T extends { name: string; streamId?: number; seriesId?: number }>(
  groups: { category: { categoryName: string }; items: T[] }[],
  rawQuery: string,
  /** Filmes e series: um resultado por obra (o provedor cadastra dublado e legendado com o mesmo nome limpo). */
  byWork = false,
): SearchHit<T>[] {
  const query = searchKey(rawQuery)
  if (!query) return []
  const words = query.split(' ')
  const best = new Map<unknown, SearchHit<T>>()
  const keep = (item: T, r: number) => {
    const id = byWork ? itemKey(item) : (item.streamId ?? item.seriesId ?? item.name)
    const prev = best.get(id)
    if (!prev || r < prev.rank) best.set(id, { item, rank: r })
  }
  for (const g of groups) {
    const categoryMatches = words.every((w) => searchKey(g.category.categoryName).includes(w))
    for (const item of g.items) {
      const r = rank(itemKey(item), query, words)
      if (r >= 0) keep(item, r)
      else if (categoryMatches) keep(item, 4)
    }
  }
  if (best.size === 0) {
    for (const g of groups) {
      for (const item of g.items) {
        const tokens = itemKey(item).split(' ')
        if (words.every((w) => fuzzyWord(w, tokens))) keep(item, 5)
      }
    }
  }
  // sort e estavel: dentro do mesmo nivel fica a ordem do catalogo.
  return [...best.values()].sort((a, b) => a.rank - b.rank)
}
