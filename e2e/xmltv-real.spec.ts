import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { MOCK } from './helpers'

// Scratch validation against a REAL guide (epg.pw, Brazil: 5.7MB, 193 channels, ~19.9k programmes) —
// accents, <title lang=...>, attribute order and "+0000" offsets as a real generator emits them, which
// the hand-written mock can't prove. Not part of the suite: it needs the file downloaded beforehand.
const REAL_EPG = process.env.REAL_EPG_FILE
const CHANNEL = '417187' // Jovem Pan News, in that file

test.skip(!REAL_EPG, 'set REAL_EPG_FILE to a downloaded XMLTV document')

test('parses and renders a real-world XMLTV guide', async ({ page }) => {
  const xml = readFileSync(REAL_EPG!, 'utf8')

  await page.route(/\/api\/stream\?.*playlist\.m3u/, (route) =>
    route.fulfill({
      contentType: 'audio/x-mpegurl',
      body: [
        '#EXTM3U url-tvg="http://localhost:8790/epg-real.xml"',
        `#EXTINF:-1 tvg-id="${CHANNEL}" group-title="Noticias",Jovem Pan News`,
        'http://localhost:8790/live/demo/demo123/1.m3u8',
      ].join('\n'),
    }),
  )
  await page.route(/\/api\/stream\?.*epg-real\.xml/, (route) => route.fulfill({ contentType: 'text/xml', body: xml }))

  await page.goto('/login')
  await page.getByRole('button', { name: 'Link M3U' }).click()
  await page.getByLabel('Link da playlist M3U').fill(`${MOCK.baseUrl}/playlist.m3u`)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)

  const started = Date.now()
  await page.goto('/guide')
  await expect(page.getByText('Programação Jovem Pan News').first()).toBeVisible({ timeout: 30000 })
  console.log(`guia real renderizado em ${Date.now() - started}ms`)
})
