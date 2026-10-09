import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Console do Christian (09/10, web): o canal ao vivo redirecionava para um endereco /auth/<token> que o provedor
// respondia 404, e o player pedia o MESMO endereco ~35 vezes. A conta tem 1 tela so: insistir num video recusado
// segura essa tela no provedor e todo o resto passa a ser recusado tambem.
test('canal ao vivo com 404 do provedor para de pedir e explica', async ({ page }) => {
  let auth = 0
  await page.route(/\/api\/stream\?.*%2Flive%2F/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.apple.mpegurl',
      body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\n/api/stream?url=http%3A%2F%2Fprovedor.test%2Fauth%2Ftoken\n',
    }),
  )
  await page.route(/%2Fauth%2F/, (route) => {
    auth += 1
    return route.fulfill({ status: 404, body: '' })
  })
  await seedSession(page)
  await page.goto('/watch/live/101?name=Canal%20Not%C3%ADcias%2024h')
  await expect(page.getByText(/O provedor não entregou este canal/)).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(6000)
  expect(auth).toBeLessThanOrEqual(2)
})
