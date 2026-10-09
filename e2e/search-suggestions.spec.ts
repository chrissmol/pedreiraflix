import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('typing in the search box shows live suggestions across movies/series/live', async ({ page }) => {
  await login(page)
  await page.getByPlaceholder('Buscar…').fill('canal')
  await expect(page.getByRole('button', { name: /Canal Notícias 24h.*Canal/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Canal Economia.*Canal/ })).toBeVisible()

  // Clicking a suggestion navigates straight to it and closes the dropdown.
  await page.getByRole('button', { name: /Canal Notícias 24h.*Canal/ }).click()
  await expect(page).toHaveURL(/\/watch\/live\/101/)
})

test('search suggestions do not appear for a one-character query', async ({ page }) => {
  await login(page)
  await page.getByPlaceholder('Buscar…').fill('c')
  await expect(page.getByRole('button', { name: /Canal Notícias/ })).toHaveCount(0)
})

test('clicking outside closes the suggestions dropdown', async ({ page }) => {
  await login(page)
  await page.getByPlaceholder('Buscar…').fill('filme')
  const suggestion = page.locator('form').getByRole('button', { name: /Filme Explosivo/ })
  await expect(suggestion).toBeVisible()
  await page.locator('body').click({ position: { x: 10, y: 300 } })
  await expect(suggestion).toHaveCount(0)
})
