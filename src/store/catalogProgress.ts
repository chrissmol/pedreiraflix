import { create } from 'zustand'

/** Fraction (0-1) of catalog categories already fetched, or null when nothing is loading. Pages publish it
 * through `CatalogProgress`; the header ring (`LoadingRing`) is the only reader. */
export const useCatalogProgress = create<{ fraction: number | null }>(() => ({ fraction: null }))
