import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('arrow keys move focus between posters within a row', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Filmes' }).click()
  await expect(page.getByRole('button', { name: 'Filme Explosivo Filme' })).toBeVisible()

  await page.getByRole('button', { name: 'Filme Explosivo Filme' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Corrida Final' })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('button', { name: 'Filme Explosivo Filme' })).toBeFocused()

  // Enter activates the focused poster like a click would.
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/movies\/1/)
})

test('respects prefers-reduced-motion: no CSS transitions/animations run', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await login(page)
  await page.getByRole('link', { name: 'Filmes' }).click()
  const poster = page.getByRole('button', { name: 'Filme Explosivo Filme' })
  await expect(poster).toBeVisible()
  // The browser normalizes "0.01ms" to seconds in computed style ("1e-05s") — assert the value, not the unit spelling.
  const durationSeconds = await poster.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))
  expect(durationSeconds).toBeLessThan(0.001)
})
