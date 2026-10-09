import { cached } from './cache'
import { isAdultCategoryName } from './adultCategory.ts'
import type { ProviderClient } from './provider'

export { isAdultCategoryName } from './adultCategory.ts'

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
