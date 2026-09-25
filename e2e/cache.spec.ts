import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('catalog is cached across navigations/reloads within the session (no refetch)', async ({ page }) => {
  const vodCalls: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('action=get_vod_streams')) vodCalls.push(req.url())
  })

  // Home shows the same movie in its own "Ação" row, and the app's single top-level Suspense boundary
  // can briefly render both trees mid-navigation — waiting for the destination heading first confirms
  // Home has actually unmounted, so the title-text locators below are never briefly ambiguous.
  const filmesHeading = page.getByRole('heading', { name: 'Filmes', level: 1 })

  await login(page)
  await page.getByRole('link', { name: 'Filmes' }).click()
  await expect(filmesHeading).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filme Explosivo Filme' })).toBeVisible()
  // Wait for every category to finish (not just the first one to render) — otherwise a still-in-flight
  // category would legitimately add one more real request later, which isn't the cache failing.
  await expect(page.getByText('Carregando filmes:')).toHaveCount(0)
  const firstLoadCalls = vodCalls.length
  expect(firstLoadCalls).toBeGreaterThan(0)

  // Navigate away and back.
  await page.getByRole('link', { name: 'Início' }).click()
  await page.getByRole('link', { name: 'Filmes' }).click()
  await expect(filmesHeading).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filme Explosivo Filme' })).toBeVisible()
  expect(vodCalls.length).toBe(firstLoadCalls) // no new requests — served from the in-memory cache

  // A full reload clears the in-memory cache, but should still hit sessionStorage instead of the network.
  await page.reload()
  await expect(filmesHeading).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filme Explosivo Filme' })).toBeVisible()
  expect(vodCalls.length).toBe(firstLoadCalls)
})

test('"continuar assistindo" appears on Filmes/Séries instantly, ahead of the catalog', async ({ page }) => {
  await login(page)
  // Seed progress directly (no need to actually watch something for this check).
  await page.evaluate(() => {
    localStorage.setItem(
      'iptv-library',
      JSON.stringify({
        state: {
          favorites: [],
          watched: {},
          progress: {
            'movie-1': {
              kind: 'movie', id: '1', name: 'Filme Explosivo', image: null, ext: 'mp4',
              positionSeconds: 300, durationSeconds: 1200, updatedAt: Date.now(),
            },
          },
        },
        version: 0,
      }),
    )
  })
  // zustand's persist middleware only reads localStorage once, at store creation — reload so it
  // rehydrates from the value we just wrote in.
  await page.reload()
  await page.getByRole('link', { name: 'Filmes' }).click()
  await expect(page.getByRole('heading', { name: 'Continuar assistindo' })).toBeVisible()
})

test('poster shows a visual progress bar in "continuar assistindo"', async ({ page }) => {
  await login(page)
  await page.evaluate(() => {
    const profilesState = JSON.parse(localStorage.getItem('iptv-profiles')!)
    const account = Object.values(profilesState.state.byAccount)[0] as { activeId: string }
    localStorage.setItem(
      'iptv-library',
      JSON.stringify({
        state: {
          favorites: {},
          watched: {},
          progress: {
            [`${account.activeId}:movie-1`]: {
              kind: 'movie', id: '1', name: 'Filme Explosivo', image: null, ext: 'mp4',
              positionSeconds: 600, durationSeconds: 1200, updatedAt: Date.now(),
            },
          },
        },
        version: 1,
      }),
    )
  })
  await page.reload()
  const card = page.getByRole('button', { name: 'Filme Explosivo 50% assistido' })
  await expect(card).toBeVisible()
  const bar = card.locator('div.bg-gradient-to-r')
  await expect(bar).toHaveCSS('width', /.+/)
  const width = await bar.evaluate((el) => el.style.width)
  expect(width).toBe('50%')
})
