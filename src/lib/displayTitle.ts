// Enfeites que o provedor poe nos nomes: estrelas, bolas, setas, bolinhas e emojis (menos (c) (R) e TM, que fazem parte de nomes).
const DECOR = /(?![©®™])[\p{Extended_Pictographic}\uFE0F\u200D★☆✪✦●○•▪▫◆◇■□▶►◀◄▸▹»«]/gu
// Palavras curtas de verdade que, em CAIXA ALTA, viram "Sem", "Uma"... (as demais de ate 3 letras sao siglas: FBI, CSI, TV).
const SMALL_WORDS = new Set('a o as os um uns uma de do da dos das em no na nos nas e ou ao aos com sem por pra para que mas se ele ela eu tu meu seu sua the of and in on at to for one two her his you me my is it'.split(' '))
const LOWER_WORDS = new Set('a o as os um uns uma de do da dos das em no na nos nas e ou ao aos com sem por pra para que mas se the of and in on at to for'.split(' '))
const ROMAN = /^(?=[IVXLCDM]+$)(?:M{0,3})(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/

function caseWord(w: string, first: boolean): string {
  const letters = w.replace(/[^\p{L}]/gu, '')
  if (!letters) return w
  // Siglas e codigos ficam como vieram: S.W.A.T., 4K, S01E02, II, ABC.
  if (/\./.test(w) || /\d/.test(w) || (ROMAN.test(letters) && letters.length > 1)) return w
  if (letters.length <= 3 && !SMALL_WORDS.has(letters.toLowerCase())) return w
  // "E" e "A" soltos (de "WALL-E" ou "PLANO B") ficam em maiuscula; so as palavras ligantes caem para minuscula.
  if (!first && LOWER_WORDS.has(letters.toLowerCase()) && letters.length > 1) return w.toLowerCase()
  if (!first && letters.length === 1 && /^[aeo]$/i.test(letters)) return w.toLowerCase()
  return w.toLowerCase().replace(/(^|[-'’(:])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
}

/** Titulo todo em CAIXA ALTA vira "Caixa Alta"; titulo com alguma minuscula nunca e mexido (WALL-E, iCarly). */
function fixCase(t: string): string {
  if (/\p{Ll}/u.test(t) || (t.match(/\p{Lu}/gu)?.length ?? 0) < 4) return t
  return t.split(' ').map((w, i) => caseWord(w, i === 0)).join(' ')
}

/** Nome para exibir: o provedor enfeita os titulos ("- Dupla Perigosa", "|BR| Bound by Fate [L] (2025) (2025)", "★ FILME ★").
 * Tira marcas entre colchetes, enfeites/emojis, barras e hifens soltos nas pontas, repete o ano uma vez so e arruma CAIXA ALTA
 * (sai com `keepCase`, para canais, onde ESPN/SPORTV/FHD sao assim mesmo). O nome cru continua sendo usado para busca e TMDB. */
export function displayTitle(name: string, keepCase = false): string {
  const t = name
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(DECOR, ' ')
    .replace(/^\s*\|[^|]{1,8}\|/, ' ')
    .replace(/(\((\d{4})\))(\s*\(\2\))+/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–|]+\s*$/, '')
    .trim()
    // "- ", "+ " ou "| " na frente; "+1", "-1" e "3 + 1" ficam como estao.
    .replace(/^(?:[-–+|]+\s+|\|+)+/, '')
    .trim()
  return keepCase ? t : fixCase(t)
}

/** Canal: mesma limpeza, sem mexer na caixa. */
export const displayChannel = (name: string) => displayTitle(name, true)

/** Ano do filme para o filtro: o campo `year` quando o painel manda, senao o "(2024)" do nome. */
export function movieYear(m: { name: string; year?: string | null }): number | null {
  const y = Number(m.year || m.name.match(/\(((?:19|20)\d{2})\)/)?.[1])
  return y > 1900 ? y : null
}

/** Titulo do episodio sem o nome da serie na frente: muitos paineis mandam "Breaking Bad S01E02" e o app ja escreve
 * "Breaking Bad - " antes, o que virava "Breaking Bad - Breaking Bad S01E02". */
export function episodeTitle(seriesName: string, title: string): string {
  const series = displayTitle(seriesName).replace(/\s*\(\d{4}\)$/, '').toLowerCase()
  const t = title.trim()
  if (!series || !t.toLowerCase().startsWith(series)) return t
  const rest = t.slice(series.length)
  // "Lost" nao come o comeco de "Lostgirl S01E01".
  if (/^[\p{L}\p{N}]/u.test(rest)) return t
  return rest.replace(/^[\s\-–:|.]*(\(\d{4}\))?[\s\-–:|.]*/, '') || t
}

/** Nome do episodio no player, no Continuar assistindo e nos downloads: "Serie - episodio", sem repetir a serie. */
export function episodeName(seriesName: string, title: string): string {
  return `${seriesName} - ${episodeTitle(seriesName, title)}`
}
