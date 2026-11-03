import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Safari 03/11: todo episodio dava 403 em vermelho sem dizer quem recusou; agora o texto do servidor aparece.
test('player mostra o corpo da recusa 403 do /api/stream', async ({ page }) => {
  await seedSession(page)
  await page.route(/\/api\/stream\?/, (route) => route.fulfill({ status: 403, contentType: 'text/plain', body: 'host not allowed' }))
  await page.goto('/movies/1')
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page.getByText(/HTTP 403: host not allowed/)).toBeVisible({ timeout: 20000 })
})
