import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Categoria com milhares de titulos (2295 no painel do Christian) levava ~4 s para montar todos os cartoes.
test('grade grande monta um bloco e acrescenta o resto ao rolar', async ({ page }) => {
  const itens = Array.from({ length: 600 }, (_, i) => ({
    stream_id: 9000 + i, name: `Titulo ${i}`, category_id: '10', rating: '7.0', added: '1700000000', year: '2021',
    genre: 'Acao', container_extension: 'mp4', stream_icon: '',
  }))
  await page.route(/action=get_vod_streams/, (r) => r.fulfill({ json: itens }))
  await seedSession(page)
  await page.goto('/movies?category=10')
  await expect(page.getByText('Titulo 5', { exact: true }).first()).toBeVisible()
  const montados = () => page.locator('main button[data-spatial]').count()
  expect(await montados()).toBeLessThan(300)
  await page.evaluate(async () => {
    const main = document.querySelector('main')!
    for (let i = 0; i < 40; i++) {
      main.scrollTop = main.scrollHeight
      await new Promise((r) => setTimeout(r, 60))
    }
  })
  await expect.poll(montados).toBeGreaterThanOrEqual(600)
})
