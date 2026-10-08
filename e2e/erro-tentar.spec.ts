import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Erro de catalogo vira um cartao com "Tentar de novo" (antes: texto vermelho solto, sem saida).
test('falha ao carregar o catalogo mostra cartao e "Tentar de novo" recupera', async ({ page }) => {
  let falhar = true
  await page.route(/\/api\/xtream\?.*action=get_vod_categories/, (route) =>
    falhar ? route.fulfill({ status: 502, body: 'bad gateway' }) : route.continue(),
  )
  await seedSession(page)
  await page.goto('/movies')
  const cartao = page.getByRole('alert')
  await expect(cartao).toContainText('instável')
  await expect(cartao).not.toContainText('502')

  falhar = false
  await cartao.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Ação' })).toBeVisible()
})
