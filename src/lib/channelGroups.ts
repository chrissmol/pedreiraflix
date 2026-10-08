// Categorias de canais ao vivo: o provedor manda nomes enfeitados ("★ GLOBO", "⚽ PREMIERE", "24HRS CANAIS")
// e nenhuma informacao de grupo. Aqui fica o nome limpo para a tela e o grupo deduzido pelo nome.

export const CHANNEL_GROUPS = ['TV aberta', 'Esportes', 'Filmes e séries', 'Notícias', 'Infantil', '24 horas', 'Outros'] as const
export type ChannelGroup = (typeof CHANNEL_GROUPS)[number]

// Siglas que ficam em maiusculas mesmo quando o resto vira "Globo", "Discovery"...
// Marcas com grafia propria que a regra geral estragaria ("RECORDTV" -> "Recordtv").
const BRANDS: Record<string, string> = { RECORDTV: 'Record TV', SPORTV: 'SporTV', REDETV: 'RedeTV', TELECINE: 'Telecine', XSPORTS: 'XSports', GLOBONEWS: 'GloboNews', CAZE: 'Cazé', 'CAZÉ': 'Cazé' }
const ACRONYMS = new Set(['TV', 'SBT', 'HBO', 'ESPN', 'NBA', 'NFL', 'UFC', 'PPV', 'HD', 'FHD', 'UHD', '4K', 'MTV', 'CNN', 'BBC', 'TNT', 'AXN', 'A&E', 'USA', 'UK'])

/** "★ GLOBO" -> "Globo", "⚽ NBA LEAGUE PASS" -> "NBA League Pass", "24HRS CANAIS" -> "24hrs Canais". Nome ja em
 * caixa mista fica como veio; so tira os enfeites. */
export function cleanCategoryName(raw: string): string {
  const name = raw.replace(/[^\p{L}\p{N}\s&+\-:().,/']/gu, ' ').replace(/\s+/g, ' ').trim()
  if (name !== name.toUpperCase()) return name
  return name
    .split(' ')
    .map((word, i) => {
      if (BRANDS[word]) return BRANDS[word]
      if (ACRONYMS.has(word)) return word
      const lower = word.toLocaleLowerCase('pt-BR')
      // Preposicoes curtas no meio ficam minusculas: "Jogos do Dia", "Filmes e Series".
      if (i > 0 && ['de', 'do', 'da', 'dos', 'das', 'e'].includes(lower)) return lower
      return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1)
    })
    .join(' ')
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Grupo pela palavra-chave no nome (e pelo ⚽ que alguns provedores usam para esporte). A ordem importa:
 * "24 HRS DESENHO" e 24 horas antes de infantil; "PARAMOUNT - FUTEBOL" e esporte antes de filmes.
 * ponytail: heuristica por nome; categoria nova com nome estranho cai em "Outros" (nunca some). */
export function channelGroupOf(raw: string): ChannelGroup {
  const n = norm(raw)
  if (/\b24 ?h(rs|oras)?\b/.test(n)) return '24 horas'
  if (raw.includes('⚽') || /futebol|esporte|sport|espn|premiere|ppv|ufc|\bnba\b|\bnfl\b|jogos|goat|caze|combate|luta|f1|formula/.test(n)) return 'Esportes'
  if (/noticia|news|jornal|cnn/.test(n)) return 'Notícias'
  if (/infantil|kids|desenho|cartoon|crianca|nick|disney junior/.test(n)) return 'Infantil'
  if (/globo|sbt|record|\bband\b|aberto|redetv|rede tv|cultura|tv aberta/.test(n)) return 'TV aberta'
  if (/filme|serie|telecine|hbo|\bmax\b|prime video|netflix|disney|paramount|star\+|cinema|megapix|apple tv/.test(n)) return 'Filmes e séries'
  return 'Outros'
}
