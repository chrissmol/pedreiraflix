import { expect, test } from '@playwright/test'
import { login } from './helpers'

// 429 do provedor (app do Windows do Christian, 09/10: depois de 2 ou 3 pedidos ele limitava e nenhum canal carregava).
// O app tem que PARAR de pedir pelo tempo do Retry-After e depois carregar normalmente.
test('429 com Retry-After: o app espera e o catalogo carrega', async ({ page }) => {
  await page.addInitScript(() => ((window as unknown as { __RATE_COOLDOWN_MS__: number }).__RATE_COOLDOWN_MS__ = 200))
  const horarios: number[] = []
  let limitadas = 0
  await page.route(/action=get_live_streams/, async (route) => {
    horarios.push(Date.now())
    if (limitadas < 2) {
      limitadas++
      return route.fulfill({ status: 429, contentType: 'text/html', headers: { 'retry-after': '4' }, body: '' })
    }
    return route.continue()
  })
  await login(page)
  await page.goto('/live')
  await expect(page.getByText('Canal Notícias 24h')).toBeVisible({ timeout: 40000 })
  expect(limitadas).toBe(2)
  // Os 3 primeiros pedidos saem juntos (uma por categoria); a nova tentativa das que levaram 429 so pode sair depois do
  // Retry-After (4 s). O app antigo tentava de novo em ~2,5 s, sem ler o Retry-After.
  const tentativasNovas = horarios.slice(3)
  expect(tentativasNovas.length).toBeGreaterThan(0)
  expect(tentativasNovas[0] - horarios[0]).toBeGreaterThanOrEqual(3800)
})

test('diagnostico explica o 429 do provedor', async ({ page }) => {
  await page.addInitScript(() => ((window as unknown as { __DIAG_GAP_MS__: number }).__DIAG_GAP_MS__ = 50))
  await page.route(/action=get_live_streams/, (route) => route.fulfill({ status: 429, contentType: 'text/html', body: '' }))
  await login(page)
  await page.goto('/diagnostico')
  await page.getByRole('button', { name: 'Testar agora' }).click()
  await expect(page.getByText(/O PROVEDOR ESTÁ LIMITANDO OS PEDIDOS/)).toBeVisible({ timeout: 30000 })
})
