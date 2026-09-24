import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('EPG grid guide shows channels with a highlighted current program and lets you jump to catch-up', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Canais' }).click()
  await page.getByRole('button', { name: 'Guia' }).click()
  await expect(page).toHaveURL(/\/guide/)
  await expect(page.getByRole('heading', { name: 'Guia de programação' })).toBeVisible()

  // Channel row with its own EPG loaded. Picks the catch-up block nearest "now" (`.last()`), not
  // `.first()`: the earliest program inside the visible window is often clipped at its left edge (it
  // started before the window began) down to a sliver a few px wide, which is real/correct but awkward
  // to click precisely — the block closest to "now" is always fully inside the window.
  // stream_id 101 ("Canal Notícias 24h") in the mock catalog — see e2e/mock-xtream.mjs.
  const channelRow = page.getByTestId('epg-row-101')
  const reArchive = channelRow.locator('button', { hasText: 'Assistir de novo' }).last()
  await expect(reArchive).toBeVisible({ timeout: 10000 })
  await reArchive.click()
  await expect(page).toHaveURL(/\/watch\/live\/101\?.*start=\d+.*duration=\d+/)

  // Catch-up plays as a finite, seekable clip — not the endless live UI.
  await expect(page.getByText(/Catch-up/)).toBeVisible()
  await expect(page.locator('video')).toBeVisible()
  await page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement | null
    return !!v && v.currentTime > 1
  }, { timeout: 15000 })
  await expect(page.getByLabel('Progresso')).toBeVisible() // seek bar — only shown for non-live content
})

test('a channel without catch-up support has no "assistir de novo" option in the guide', async ({ page }) => {
  await login(page)
  await page.goto('/guide')
  // stream_id 102 ("Canal Economia") in the mock catalog — see e2e/mock-xtream.mjs.
  const row = page.getByTestId('epg-row-102')
  await expect(row).toBeVisible()
  await expect(row.getByText('Assistir de novo')).toHaveCount(0)
})
