import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// "Times" -> campeonatos: campeonato -> times -> jogos -> canal. A Mol TV API e simulada: sem rota por campeonato
// (404), entao a tela junta os jogos dos times de ponta e filtra pelo campeonato.
const h = (n: number) => new Date(Date.now() + n * 3600_000).toISOString()
const jogo = (id: number, home: string, away: string, comp: string, hours: number, canal = 'Esporte Total') => ({
  match: { id: `fd:${id}`, home, away, kickoff: h(hours), competition: comp, status: 'scheduled' },
  broadcasts: [{ channel: canal, slug: 'x', confidence: 'confirmada' }],
})

async function mockApi(page: import('@playwright/test').Page) {
  await page.route('**/api/moltv/v1/competitions/*/next', (route) => route.fulfill({ status: 404, body: 'nope' }))
  await page.route('**/api/moltv/v1/search?*', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? ''
    const known: Record<string, string> = { Flamengo: 'flamengo', Palmeiras: 'palmeiras', Corinthians: 'corinthians' }
    route.fulfill({ json: { results: known[q] ? [{ type: 'team', slug: known[q], name: q }] : [] } })
  })
  // O Playwright usa a rota registrada por ultimo primeiro: a generica vem antes das especificas.
  await page.route('**/api/moltv/v1/teams/*/next', (route) => route.fulfill({ json: { matches: [] } }))
  await page.route('**/api/moltv/v1/teams/flamengo/next', (route) =>
    route.fulfill({
      json: {
        matches: [
          jogo(1, 'Flamengo', 'Vasco', 'Brasileirão', 3),
          jogo(2, 'Flamengo', 'Bayern', 'UEFA Champions League', 5),
          ...[4, 5, 6, 7, 8, 9, 10].map((i) => jogo(10 + i, 'Flamengo', `Rival ${i}`, 'Campeonato Brasileiro Série A', i * 24)),
        ],
      },
    }),
  )
  await page.route('**/api/moltv/v1/teams/palmeiras/next', (route) =>
    route.fulfill({ json: { matches: [jogo(1, 'Flamengo', 'Vasco', 'Brasileirão', 3), jogo(3, 'Palmeiras', 'Santos', 'Brasileirão', 30)] } }),
  )
}

test('seguir um campeonato mostra os times, 5 jogos (ver mais ate 10) e so os dele, e guarda no perfil', async ({ page }) => {
  await mockApi(page)
  await seedSession(page)
  await page.goto('/times')
  await page.getByRole('button', { name: 'Seguir um campeonato' }).click()
  await page.getByRole('button', { name: 'Brasileirão Série A' }).click()

  const card = page.getByRole('region', { name: 'Brasileirão Série A' })
  await expect(card.getByText('Flamengo × Vasco')).toBeVisible()
  // Times do campeonato (achados pela busca) e jogos de times diferentes na mesma lista, sem repetir o mesmo jogo.
  await expect(card.getByRole('button', { name: 'Seguir Palmeiras' })).toBeVisible()
  await expect(card.getByText('Palmeiras × Santos')).toBeVisible()
  await expect(card.getByText('Flamengo × Vasco')).toHaveCount(1)
  // Jogo de outro campeonato (Champions) fica de fora.
  await expect(card.getByText('Bayern')).toHaveCount(0)
  // 5 jogos e o "Ver mais" libera ate 10.
  await expect(card.locator('li', { hasText: '×' })).toHaveCount(4) // 4 em "Depois" + o destaque
  await card.getByRole('button', { name: 'Ver mais jogos' }).click()
  await expect(card.locator('li', { hasText: '×' })).toHaveCount(8)
  await expect(card.getByRole('button', { name: 'Ver mais jogos' })).toHaveCount(0)

  // Tocar no canal do jogo abre o canal do provedor (um achado so abre direto).
  await card.getByRole('button', { name: /^Esporte Total/ }).first().click()
  await expect(page).toHaveURL(/\/watch\/live\/201/)
  await page.goBack()

  // Seguir um time daqui vai para os times favoritos.
  await page.getByRole('region', { name: 'Brasileirão Série A' }).getByRole('button', { name: 'Seguir Palmeiras' }).click()
  await expect(page.getByRole('region', { name: 'Palmeiras' })).toBeVisible()

  // Fica salvo no perfil.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Brasileirão Série A' })).toBeVisible()
  await page.getByRole('button', { name: 'Deixar de seguir Brasileirão Série A' }).click()
  await expect(page.getByRole('region', { name: 'Brasileirão Série A' })).toHaveCount(0)
})

test('usa a rota por campeonato da API quando ela existe', async ({ page }) => {
  await page.route('**/api/moltv/v1/competitions/premier-league/next', (route) =>
    route.fulfill({ json: { teams: [{ slug: 'arsenal', name: 'Arsenal' }], matches: [jogo(9, 'Arsenal', 'Chelsea', 'Premier League', 4, 'Canal')] } }),
  )
  await seedSession(page)
  await page.goto('/times')
  await page.getByRole('button', { name: 'Seguir um campeonato' }).click()
  await page.getByRole('button', { name: 'Premier League' }).click()
  const card = page.getByRole('region', { name: 'Premier League' })
  await expect(card.getByText('Arsenal × Chelsea')).toBeVisible()
  await expect(card.getByRole('button', { name: 'Seguir Arsenal' })).toBeVisible()
})
