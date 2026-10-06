import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Relato do Christian: "parece que o site primeiro carrega todos os filmes, series e canais pra so depois
// conseguirmos assistir". Era a fila unica: o pedido do filme esperava atras de cada categoria. Aqui o
// catalogo fica lento de proposito e o filme tem que abrir mesmo assim.
test('abrir um filme nao espera o catalogo terminar de carregar', async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=(get_vod_streams|get_series)&/, async (route) => {
    await new Promise((r) => setTimeout(r, 3000))
    await route.continue()
  })
  await seedSession(page)
  await page.goto('/')
  // Da tempo do Inicio encher a fila com as categorias de filmes e series.
  await expect(page.getByText(/Carregando catálogo/)).toBeVisible()

  // Navegacao por dentro do app (como um clique), nao page.goto: recarregar a pagina zeraria a fila.
  const start = Date.now()
  await page.evaluate(() => {
    history.pushState({}, '', '/movies/1')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('heading', { name: 'Filme Explosivo' })).toBeVisible({ timeout: 10_000 })
  expect(Date.now() - start).toBeLessThan(2000)
})
