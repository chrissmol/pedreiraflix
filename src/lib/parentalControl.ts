import { cached } from './cache'
import { normalizeText } from './search'
import type { ProviderClient } from './provider'

// Xtream panels have no standard "this category is adult content" flag — providers just name the
// category something recognizable ("XXX", "Adultos +18", "Hot", ...). Matching on the category name is
// the same heuristic every third-party Xtream client uses for this, and it's what the categories in the
// wild actually look like. It isn't foolproof (a provider could name a category anything), so this is a
// household-appropriate filter, not a real content rating system.
const ADULT_KEYWORDS = ['adult', 'xxx', '+18', '18+', 'hot', 'sensual', 'erotic', 'erótic', 'porn']

export function isAdultCategoryName(categoryName: string): boolean {
  const normalized = normalizeText(categoryName)
  return ADULT_KEYWORDS.some((kw) => normalized.includes(kw))
}

/** Guards a direct link (bookmark, typed URL, stale continue-watching entry) that bypassed the already-filtered
 * catalog lists — checks the one category this item belongs to, using the same cached category lookups the
 * catalog pages already populate, so this is normally instant. */
export async function isCategoryBlocked(
  client: ProviderClient,
  kind: 'live' | 'movie' | 'series',
  categoryId: string | null | undefined,
): Promise<boolean> {
  if (!categoryId) return false
  const loaders = {
    live: () => client.getLiveCategories(),
    movie: () => client.getVodCategories(),
    series: () => client.getSeriesCategories(),
  }
  const categories = await cached(`${kind}:categories`, loaders[kind])
  const category = categories.find((c) => c.categoryId === categoryId)
  return Boolean(category && isAdultCategoryName(category.categoryName))
}
