import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Log real (Safari, conta com 1 tela): o provedor respondeu 403 e a fila seguiu pedindo todos os episodios.
test('baixar serie inteira para no primeiro 403 e explica o motivo', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  let pedidos = 0
  await page.route(/\/api\/stream\?/, (route) => {
    pedidos++
    return route.fulfill({ status: 403, contentType: 'text/plain', body: 'no' })
  })
  await login(page)
  await page.goto('/series/50')
  await page.getByRole('button', { name: 'Baixar série inteira (ZIP)' }).click()
  await expect(page.getByText(/O provedor recusou o download \(HTTP 403\)/)).toBeVisible({ timeout: 20000 })
  expect(pedidos).toBeLessThanOrEqual(4) // 1 episodio x ate 3 tentativas; os demais nem comecam
})
