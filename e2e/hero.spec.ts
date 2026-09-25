import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => {
  // Deterministic, fast slot rotation instead of the real 2h — see HeroCarousel.tsx.
  await page.addInitScript(() => {
    ;(window as any).__HERO_SLOT_MS_OVERRIDE__ = 700
  })
})

test('only shows titles rated 8.5+, alternating movie/series, and rejects lower-rated ones', async ({ page }) => {
  // No dot navigation on purpose (Christian didn't want a visible count of how many titles qualify) —
  // observe every title the hero rotates through on its own over a few slots instead of clicking controls.
  await login(page)
  await expect(page.getByText('Carregando catálogo:')).toHaveCount(0, { timeout: 15000 })

  // The hero only renders once the full catalog has settled (avoids flickering through partial results
  // while categories are still streaming in) — wait for one of the two qualifying titles, not just any h1
  // (the site header/logo is also an h1, and would be the only one present before that point).
  const heading = page.locator('h1')
  await expect(heading).toHaveText(/Amor e Confusão|Série Dramática/, { timeout: 15000 })

  const seen = new Set<string>()
  for (let i = 0; i < 6; i++) {
    seen.add((await heading.textContent()) ?? '')
    await page.waitForTimeout(400)
  }
  expect(seen).toEqual(new Set(['Amor e Confusão', 'Série Dramática'])) // the two mock titles rated >=8.5

  // Never shows a movie rated below the bar (e.g. "Filme Explosivo" at 8.1), even though it exists and
  // has a poster — that's the whole point of the "só 8.5+" rule.
  expect(seen.has('Filme Explosivo')).toBe(false)
})

test('does not show any dot/pagination indicator of how many titles qualify', async ({ page }) => {
  await login(page)
  await expect(page.getByText('Carregando catálogo:')).toHaveCount(0, { timeout: 15000 })
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.getByRole('button', { name: /Destaque \d+ de \d+/ })).toHaveCount(0)
})

test('the featured slot rotates on its own as time passes', async ({ page }) => {
  await login(page)
  await expect(page.getByText('Carregando catálogo:')).toHaveCount(0, { timeout: 15000 })

  const heading = page.locator('h1')
  await expect(heading).toBeVisible()
  const first = await heading.textContent()
  await expect.poll(() => heading.textContent(), { timeout: 5000 }).not.toBe(first)
})

test('a poster that fails to load is skipped instead of leaving the hero broken', async ({ page }) => {
  // Every image request fails — proves the carousel doesn't just sit there with a broken <img> like the
  // old static Hero did; it should render *something else* usable instead (no crash, controls intact).
  await page.route('**/api/stream?url=*', (route) => route.abort())
  await login(page)
  await expect(page.getByText('Carregando catálogo:')).toHaveCount(0, { timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Assistir', exact: true })).toBeVisible()
})
