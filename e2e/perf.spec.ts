import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('an already-loaded category row does not re-render when a later category finishes loading', async ({ page }) => {
  await login(page)
  await page.goto('/movies')
  // Wait for the first category ("Ação", 2 movies) to actually be on screen.
  await expect(page.getByRole('button', { name: 'Filme Explosivo Filme' })).toBeVisible()

  const firstCategoryCount = await page.evaluate(
    () => (window as any).__categoryRowRenders?.['Ação'],
  )
  expect(firstCategoryCount).toBeGreaterThan(0)

  // Wait for every category to finish loading (the "Carregando filmes: x/y" indicator disappears).
  await expect(page.getByText('Carregando filmes:')).toHaveCount(0, { timeout: 15000 })

  const finalCount = await page.evaluate(() => (window as any).__categoryRowRenders?.['Ação'])
  // Some re-renders are expected (React 18/19 batching, StrictMode double-invoke in dev), but it must
  // not scale with how many OTHER categories loaded afterward — that's exactly the jank this prevents.
  expect(finalCount).toBeLessThanOrEqual(firstCategoryCount + 1)
})
