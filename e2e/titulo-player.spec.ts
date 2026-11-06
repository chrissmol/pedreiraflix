import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// O cabeçalho do player usa a mesma limpeza de título do resto do app (nome cru continua na URL).
const casos: Array<[string, string, string]> = [
  ['movie/1', '- Dupla Perigosa [L] (2025) (2025)', 'Dupla Perigosa (2025)'],
  ['movie/1', '|BR| ★ SEM VOLTA PARA CASA ★', 'Sem Volta para Casa'],
  ['movie/1', 'Spider-Man - Sem Volta', 'Spider-Man - Sem Volta'],
  ['series/7', '- Série Dramática - T1E2', 'Série Dramática - T1E2'],
  ['live/101', '★ ESPN FHD ★', 'ESPN FHD'],
]

for (const [rota, cru, esperado] of casos) {
  test(`player mostra "${esperado}" para "${cru}"`, async ({ page }) => {
    await seedSession(page)
    await page.goto(`/watch/${rota}?name=${encodeURIComponent(cru)}`)
    await expect(page.getByRole('heading', { level: 1, name: esperado, exact: true })).toBeAttached()
  })
}

test.describe('TV', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })
  test('player na TV mostra o título limpo', async ({ page }) => {
    await seedSession(page)
    await page.goto(`/watch/movie/1?name=${encodeURIComponent('- Dupla Perigosa')}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Dupla Perigosa', exact: true })).toBeAttached()
  })
})
