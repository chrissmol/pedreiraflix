import { expect, test, type Page } from '@playwright/test'
import { MOCK } from './helpers'

const PLAYLIST_URL = `${MOCK.baseUrl}/playlist.m3u`

async function expectClassified(page: Page) {
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/live')
  await expect(page.getByText('Canal M3U Teste').first()).toBeVisible()
  await page.goto('/movies')
  await expect(page.getByText('Filme M3U Teste').first()).toBeVisible()
  await page.goto('/series')
  await expect(page.getByText('Serie M3U Teste').first()).toBeVisible()
}

test('M3U login by link classifies live, movie and series', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Link M3U' }).click()
  await page.getByLabel('Link da playlist M3U').fill(PLAYLIST_URL)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expectClassified(page)
})

test('M3U login by file classifies live, movie and series', async ({ page, request }) => {
  const body = await (await request.get(PLAYLIST_URL)).text()
  await page.goto('/login')
  await page.getByRole('button', { name: 'Arquivo M3U' }).click()
  await page.getByLabel('Arquivo M3U do aparelho').setInputFiles({ name: 'lista.m3u', mimeType: 'audio/x-mpegurl', buffer: Buffer.from(body) })
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expectClassified(page)
})
