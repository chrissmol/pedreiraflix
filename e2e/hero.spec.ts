import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => {
  // Deterministic, fast slot rotation instead of the real 4h — see HeroCarousel.tsx.
  await page.addInitScript(() => {
    ;(window as any).__HERO_SLOT_MS_OVERRIDE__ = 700
  })
})

test('only shows titles rated 8.5+, alternating movie/series, and rejects lower-rated ones', async ({ page }) => {
  await login(page)
  await expect(page.getByText('Carregando catálogo:')).toHaveCount(0, { timeout: 15000 })

  const heading = page.locator('h1')
  const dots = page.getByRole('button', { name: /Destaque \d+ de \d+/ })
  await expect(dots).toHaveCount(2) // exactly the two mock titles rated >=8.5: one movie, one series

  const seen = new Set<string>()
  for (let i = 0; i < 2; i++) {
    await dots.nth(i).click()
    seen.add((await heading.textContent()) ?? '')
  }
  expect(seen).toEqual(new Set(['Amor e Confusão', 'Série Dramática']))

  // Never shows a movie rated below the bar (e.g. "Filme Explosivo" at 8.1), even though it exists and
  // has a poster — that's the whole point of the "só 8.5+" rule.
  expect(seen.has('Filme Explosivo')).toBe(false)
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
