import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Busca vazia mostra "Em alta esta semana" (só com o que existe no catálogo) e some ao pesquisar.
const TELAS = {
  computador: {},
  celular: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
  tv: {
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  },
}

for (const [nome, tela] of Object.entries(TELAS)) {
  test.describe(nome, () => {
    test.use(tela)
    test(`${nome}: busca vazia mostra Em alta`, async ({ page }) => {
      await page.route('**/api/em-alta?kind=movie', (route) => route.fulfill({ json: { titles: ['Corrida Final'] } }))
      await page.route('**/api/em-alta?kind=tv', (route) => route.fulfill({ json: { titles: ['Drama Series'] } }))
      await seedSession(page)
      await page.goto('/search')
      await expect(page.getByRole('heading', { name: 'Em alta esta semana' })).toBeVisible()
      await page.goto('/search?q=corrida')
      await expect(page.getByRole('heading', { name: 'Em alta esta semana' })).toHaveCount(0)
    })
  })
}
