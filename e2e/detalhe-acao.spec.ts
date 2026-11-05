import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

// Detalhe do filme: o botao Assistir vem logo depois da sinopse, antes do elenco (que e longo). Computador, celular e TV.
const TELAS = {
  computador: {},
  celular: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
  tv: {
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  },
}
const cast = Array.from({ length: 12 }, (_, i) => ({ name: `Ator ${i + 1}`, character: `Papel ${i + 1}`, photo: null }))

async function abrir(page: Page) {
  await page.route('**/api/tmdb?*', (route) => route.fulfill({ json: { genres: [], year: null, rating: null, overview: null, imdbRating: null, cast } }))
  await seedSession(page)
  await page.goto('/movies/1')
}

for (const [nome, tela] of Object.entries(TELAS)) {
  test.describe(nome, () => {
    test.use(tela)
    test(`${nome}: Assistir fica acima do elenco`, async ({ page }) => {
      await abrir(page)
      const elenco = page.getByRole('region', { name: 'Elenco' })
      await expect(elenco).toBeVisible()
      const assistir = (await page.getByRole('button', { name: /Assistir/ }).first().boundingBox())!
      const lista = (await elenco.boundingBox())!
      expect(assistir.y).toBeLessThan(lista.y)
    })
  })
}
