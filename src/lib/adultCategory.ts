import { normalizeText } from './search.ts'

// Xtream panels have no standard "this category is adult content" flag — providers just name the
// category something recognizable ("XXX", "Adultos +18", "Hot", ...). Matching on the category name is
// the same heuristic every third-party Xtream client uses for this, and it's what the categories in the
// wild actually look like. It isn't foolproof (a provider could name a category anything), so this is a
// household-appropriate filter, not a real content rating system.
//
// Palavra inteira: "hot" como pedaco pegava "Hotel Transylvania" e "Photography" e escondia categorias
// infantis do perfil Kids. shortcut: "Hot Wheels" ainda e pego (e a palavra "hot" mesmo); usar lista de
// excecoes se o provedor tiver uma categoria assim.
const ADULT_WORDS = /\b(?:adult|adults|adulto|adultos|xxx|hot|sensual|erotic|erotica|erotico|porn|porno|porn[ao]grafia)\b/
const ADULT_AGE = /\+\s?18|18\s?\+/

export function isAdultCategoryName(categoryName: string): boolean {
  const normalized = normalizeText(categoryName)
  return ADULT_WORDS.test(normalized) || ADULT_AGE.test(normalized)
}
