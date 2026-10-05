import { expect, test } from '@playwright/test'
import { MOCK } from './helpers'

const PLAYLIST_URL = `${MOCK.baseUrl}/playlist.m3u`
const GUIDE_URL = `${MOCK.baseUrl}/guide.xml`

// A playlist with tvg-id but no url-tvg on the header is the common real-world case (iptv-org's public
// lists are like this), so without the manual field those channels could never get a guide.
const NO_URL_TVG = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="canal.teste" group-title="Noticias",Canal M3U Teste',
  'http://localhost:8790/live/demo/demo123/1.m3u8',
].join('\n')

test('a typed EPG link gives a guide to a playlist that declares none', async ({ page }) => {
  await page.route(/\/api\/stream\?.*playlist\.m3u/, (route) =>
    route.fulfill({ contentType: 'audio/x-mpegurl', body: NO_URL_TVG }),
  )

  await page.goto('/login')
  await page.getByRole('button', { name: 'Link M3U' }).click()
  await page.getByLabel('Link da playlist M3U').fill(PLAYLIST_URL)
  await page.getByLabel(/Link do guia/).fill(GUIDE_URL)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.goto('/guide')
  await expect(page.getByText('Jornal do Mock')).toBeVisible({ timeout: 10000 })
})

test('the field is optional — signing in with it empty still works', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Link M3U' }).click()
  await page.getByLabel('Link da playlist M3U').fill(PLAYLIST_URL)
  await expect(page.getByLabel(/Link do guia/)).toHaveValue('')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
})
