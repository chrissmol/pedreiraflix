import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Back used to drop you at the top of the list, so finding where you were meant scrolling again.
test('going back restores the list scroll position', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Filmes' }).click()
  await expect(page.getByRole('heading', { name: 'Filmes', level: 1 })).toBeVisible()

  const main = page.locator('#main-content')
  // Categories stream in one at a time, so scrolling before the page is tall enough silently clamps to 0
  // — under a loaded machine that happened often enough to make this test flaky.
  await expect.poll(() => main.evaluate((el) => el.scrollHeight - el.clientHeight), { timeout: 15000 }).toBeGreaterThan(400)
  await main.evaluate((el) => el.scrollTo(0, 400))
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(300)

  await page.getByText('Risada Garantida').click()
  await expect(page).toHaveURL(/\/movies\/4/)
  // A fresh page still opens at the top.
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBe(0)

  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Filmes', level: 1 })).toBeVisible()
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(300)
})
