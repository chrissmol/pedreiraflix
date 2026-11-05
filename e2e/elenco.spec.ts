import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

// Elenco com foto e personagem (TMDB): so os primeiros, o resto abre sob demanda. Computador, celular e TV
// (Fire TV, so setas e OK), porque o APK e o app do Windows abrem o site.
const TELAS = {
  computador: {},
  celular: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
  tv: {
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  },
}

const cast = Array.from({ length: 20 }, (_, i) => ({ name: `Ator ${i + 1}`, character: `Papel ${i + 1}`, photo: i === 0 ? null : 'https://image.tmdb.org/t/p/w185/x.jpg' }))

async function abrir(page: Page) {
  await page.route('**/api/tmdb?*', (route) => route.fulfill({ json: { genres: [], year: null, rating: null, overview: null, imdbRating: null, cast } }))
  await seedSession(page)
  await page.goto('/movies/1')
}

for (const [nome, tela] of Object.entries(TELAS)) {
  test.describe(nome, () => {
    test.use(tela)
    test(`${nome}: elenco mostra os 8 primeiros e expande o resto`, async ({ page }) => {
      await abrir(page)
      const lista = page.getByRole('region', { name: 'Elenco' })
      await expect(lista.getByText('Ator 8', { exact: true })).toBeVisible()
      await expect(lista.getByText('Papel 8')).toBeVisible()
      await expect(lista.getByText('Ator 9', { exact: true })).toBeHidden()
      const botao = lista.getByRole('button', { name: /Ver elenco completo \(20\)/ })
      if (nome === 'tv') {
        await botao.focus()
        await page.keyboard.press('Enter')
      } else await botao.click()
      await expect(lista.getByText('Ator 20', { exact: true })).toBeVisible()
      await expect(lista.getByRole('button', { name: 'Ver menos' })).toHaveAttribute('aria-expanded', 'true')
      await page.screenshot({ path: `test-results/elenco-${nome}.png` })
      await lista.getByRole('button', { name: 'Ver menos' }).click()
      await expect(lista.getByText('Ator 20', { exact: true })).toBeHidden()
    })
  })
}

test('sem elenco do TMDB usa os nomes do provedor, um por cartao', async ({ page }) => {
  await page.route('**/api/tmdb?*', (route) => route.fulfill({ json: { genres: [], cast: [] } }))
  await seedSession(page)
  await page.goto('/movies/1')
  const lista = page.getByRole('region', { name: 'Elenco' })
  await expect(lista.getByText('Ator A', { exact: true })).toBeVisible()
  await expect(lista.getByText('Atriz B', { exact: true })).toBeVisible()
  await expect(lista.getByRole('button')).toHaveCount(0)
})
