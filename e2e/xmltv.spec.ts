import { expect, test, type Page } from '@playwright/test'
import { MOCK } from './helpers'

const PLAYLIST_URL = `${MOCK.baseUrl}/playlist.m3u`

async function loginM3u(page: Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Link M3U' }).click()
  await page.getByLabel('Link da playlist M3U').fill(PLAYLIST_URL)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
}

// The playlist declares its guide with url-tvg and links channels to it with tvg-id — before this, an M3U
// session had no EPG at all and the guide page was empty.
test('an M3U playlist gets its guide from the XMLTV it declares', async ({ page }) => {
  await loginM3u(page)
  await page.goto('/guide')
  await expect(page.getByRole('heading', { name: 'Guia de programação' })).toBeVisible()
  await expect(page.getByText('Jornal do Mock')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Documentario do Mock')).toBeVisible()
})

test('XMLTV never marks a program as catch-up (an M3U playlist has no archive)', async ({ page }) => {
  await loginM3u(page)
  await page.goto('/guide')
  await expect(page.getByText('Jornal do Mock')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Assistir de novo')).toHaveCount(0)
})

test('a playlist without url-tvg still works, just with no guide', async ({ page }) => {
  // The app never fetches the playlist directly — it goes through the Worker proxy (/api/stream?raw=1),
  // so that is the request to intercept.
  await page.route(/\/api\/stream\?.*playlist\.m3u/, (route) =>
    route.fulfill({
      contentType: 'audio/x-mpegurl',
      body: ['#EXTM3U', '#EXTINF:-1 group-title="Noticias",Canal Sem Guia', 'http://localhost:8790/live/demo/demo123/1.m3u8'].join('\n'),
    }),
  )
  await loginM3u(page)
  await page.goto('/live')
  await expect(page.getByText('Canal Sem Guia').first()).toBeVisible()
  await page.goto('/guide')
  await expect(page.getByRole('heading', { name: 'Guia de programação' })).toBeVisible()
})
