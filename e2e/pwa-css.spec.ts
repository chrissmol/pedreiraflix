import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('app shell blocks overscroll and UI chrome is not selectable', async ({ page }) => {
  await login(page)
  const main = page.locator('#main-content')
  await expect(main).toHaveCSS('overscroll-behavior-y', 'none')
  await expect(page.locator('body')).toHaveCSS('overscroll-behavior-y', 'none')
  await expect(page.getByRole('button').first()).toHaveCSS('user-select', 'none')
})
