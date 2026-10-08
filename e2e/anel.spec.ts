import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// O progresso do catalogo virou um anel azul no cabecalho (no lugar da barra com "x/y categorias" no
// meio da pagina): aparece enquanto carrega, some quando termina, e nada de numeros na tela.
test('anel de carregamento no cabecalho', async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=get_vod_streams&/, async (route) => {
    await new Promise((r) => setTimeout(r, 2000))
    await route.continue()
  })
  await seedSession(page)
  await page.goto('/movies')
  await expect(page.locator('header .loading-ring')).toBeVisible()
  await expect(page.locator('header .loading-ring')).toHaveCount(0, { timeout: 15_000 })
})
