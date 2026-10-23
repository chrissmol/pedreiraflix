import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

// Provedor sem elenco e sem miniatura de episodio: o TVmaze (via /api/tmdb, kind=tv) preenche e o credito
// aparece. Em computador, celular e TV (Fire TV, so setas e OK), porque o APK e o app do Windows abrem o site.
const TELAS = {
  computador: {},
  celular: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
  tv: {
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  },
}

async function abrirSerie(page: Page) {
  await page.route(/\/api\/xtream\?.*action=get_series_info/, async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    json.info.cast = ''
    for (const eps of Object.values(json.episodes as Record<string, { info: { movie_image?: string } }[]>)) {
      for (const ep of eps) delete ep.info.movie_image
    }
    await route.fulfill({ response: res, json })
  })
  await page.route('**/api/tmdb?*', (route) =>
    route.fulfill({ json: { genres: [], year: null, rating: null, overview: null, imdbRating: '9.1', tvmaze: { cast: 'Ator Um, Atriz Dois', episodeImages: { '1x1': 'https://static.tvmaze.com/ep1.jpg' } } } }),
  )
  await seedSession(page)
  await page.goto('/series/50')
  await expect(page.getByText('Ator Um, Atriz Dois')).toBeVisible()
  await expect(page.getByText(/TVmaze\.com/)).toBeVisible()
  await expect(page.locator('img[src*="static.tvmaze.com%2Fep1.jpg"]')).toHaveCount(1)
}

for (const [nome, tela] of Object.entries(TELAS)) {
  test.describe(nome, () => {
    test.use(tela)
    test(`${nome}: elenco e miniatura do TVmaze quando o provedor nao manda, com credito`, async ({ page }) => {
      await abrirSerie(page)
      if (nome === 'tv') {
        // O credito e so texto: nao rouba o foco, as setas seguem chegando nos episodios.
        for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown')
        const focado = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || '')
        expect(focado).toMatch(/Assistir episódio|como visto|Baixar|download/i)
      }
    })
  })
}

test('sem dados do TVmaze nao mostra o credito', async ({ page }) => {
  await page.route('**/api/tmdb?*', (route) => route.fulfill({ json: { genres: [], imdbRating: null, tvmaze: null } }))
  await seedSession(page)
  await page.goto('/series/50')
  await expect(page.getByRole('heading', { name: 'Série Dramática' })).toBeVisible()
  await expect(page.getByText(/TVmaze/)).toHaveCount(0)
})
