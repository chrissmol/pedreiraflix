import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Conta real (09/10): no lugar do Record o provedor mandou uma lista "fechada" (1 trecho de 10 s + #EXT-X-ENDLIST,
// no bloqueio.example) que nao toca, e o player ficava em "Conexao lenta... ainda carregando" para sempre.
test('canal ao vivo que chega como video fechado avisa que o provedor bloqueou', async ({ page }) => {
  await page.route(/\/api\/stream\?.*%2Flive%2F/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.apple.mpegurl',
      body: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-TARGETDURATION:11\n#EXTINF:10.0,\n/api/stream?url=http%3A%2F%2Fbloqueio.test%2Fauth%2Ftoken\n#EXT-X-ENDLIST\n',
    }),
  )
  await page.route(/bloqueio\.test/, (route) => route.fulfill({ status: 404, body: '' }))
  await seedSession(page)
  await page.goto('/watch/live/101?name=Canal%20Not%C3%ADcias%2024h')
  await expect(page.getByText(/O provedor bloqueou este canal agora/)).toBeVisible({ timeout: 15000 })
})
