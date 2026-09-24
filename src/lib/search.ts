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
