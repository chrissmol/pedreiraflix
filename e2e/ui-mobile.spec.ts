import { expect, test } from '@playwright/test'
import { login } from './helpers'

const PHONE = { width: 390, height: 844 }

test('on a phone the catalog filters live in a sheet behind "Filtros"', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await login(page)
  await page.goto('/movies')

  const sort = page.getByRole('button', { name: 'Nome (A-Z)' })
  await expect(sort).toBeHidden()
  await page.getByRole('button', { name: 'Filtros' }).click()
  await expect(sort).toBeVisible()
})

test('runtime is shown as a length, not a raw clock string', async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=get_vod_info/, async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    json.info.duration = '01:32:00'
    await route.fulfill({ response: res, json })
  })
  await login(page)
  await page.goto('/movies/1')
  await expect(page.getByText('1h 32min')).toBeVisible()
  await expect(page.getByText('01:32:00')).toHaveCount(0)
})
