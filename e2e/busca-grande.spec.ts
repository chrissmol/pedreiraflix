import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Buscar "a" no painel real do Christian montava ~29 mil cartoes de uma vez. Cada secao mostra um bloco de 60
// e o resto vem em "Mostrar mais".
test('busca com muitos resultados mostra um bloco e amplia sob pedido', async ({ page }) => {
  const itens = Array.from({ length: 300 }, (_, i) => ({
    stream_id: 9000 + i, name: `Aventura ${i}`, category_id: '10', rating: '7.0', added: '1700000000', year: '2021',
    genre: 'Acao', container_extension: 'mp4', stream_icon: '',
  }))
  await page.route(/action=get_vod_streams/, (r) => r.fulfill({ json: itens }))
  await seedSession(page)
  await page.goto('/search?q=aventura')
  const maisFilmes = page.getByRole('button', { name: /^Mostrar mais/ }).first()
  await expect(maisFilmes).toBeVisible()
  const montados = () => page.locator('main button[data-spatial]').count()
  const antes = await montados()
  expect(antes).toBeLessThan(150)
  await maisFilmes.click()
  await expect.poll(montados).toBeGreaterThan(antes)
})
