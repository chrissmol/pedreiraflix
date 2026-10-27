import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Aba "Times favoritos": busca o time na API do Mol TV (via /api/moltv do nosso Worker), segue, e mostra
// os proximos jogos com o canal. A API do Mol TV e simulada aqui para o teste nao depender da rede.
test('seguir um time mostra os proximos jogos com o canal', async ({ page }) => {
  await page.route('**/api/moltv/v1/search?*', (route) =>
    route.fulfill({ json: { results: [{ type: 'team', slug: 'flamengo', name: 'Flamengo' }, { type: 'competition', slug: 'brasileirao', name: 'Brasileirão' }] } }),
  )
  await page.route('**/api/moltv/v1/teams/flamengo/next', (route) =>
    route.fulfill({
      json: {
        matches: [
          {
            match: { id: 'fd:1', home: 'Flamengo', away: 'Vasco', kickoff: '2030-10-26T23:00:00Z', competition: 'Brasileirão', status: 'scheduled' },
            broadcasts: [{ channel: 'Premiere', slug: 'premiere', confidence: 'provavel' }],
          },
          {
            match: { id: 'fd:2', home: 'Palmeiras', away: 'Flamengo', kickoff: '2030-11-02T19:00:00Z', competition: 'Copa do Brasil', status: 'scheduled' },
            broadcasts: [],
          },
          {
            match: { id: 'fd:3', home: 'Flamengo', away: 'Bahia', kickoff: '2030-11-09T21:00:00Z', competition: 'Brasileirão', status: 'scheduled' },
            broadcasts: [
              { channel: 'Globo', slug: 'globo', confidence: 'confirmada' },
              { channel: 'SporTV', slug: 'sportv', confidence: 'provavel' },
            ],
          },
        ],
      },
    }),
  )
  await seedSession(page)
  await page.goto('/times')
  await expect(page.getByRole('heading', { name: 'Times favoritos' })).toBeVisible()

  await page.getByLabel('Seguir um time').fill('flam')
  await page.getByRole('button', { name: 'Flamengo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Flamengo', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Brasileirão' })).toHaveCount(0)

  const card = page.getByRole('region', { name: 'Flamengo' })
  await expect(card.getByText('Flamengo × Vasco')).toBeVisible()
  await expect(card.getByRole('button', { name: 'Premiere, provável: abrir o canal ao vivo' })).toBeVisible()
  await expect(card.getByText('Canal a confirmar')).toBeVisible()
  // Com canal confirmado, os provaveis somem daquele jogo
  await expect(card.getByRole('button', { name: 'Globo, confirmado: abrir o canal ao vivo' })).toBeVisible()
  await expect(card.getByText('SporTV')).toHaveCount(0)

  // Fica salvo no perfil: recarregar mantem o time
  await page.reload()
  await expect(page.getByRole('region', { name: 'Flamengo' })).toBeVisible()
  await page.getByRole('button', { name: 'Deixar de seguir Flamengo' }).click()
  await expect(page.getByRole('region', { name: 'Flamengo' })).toHaveCount(0)
})

// O canal do jogo leva ao canal ao vivo do provedor: um achado abre direto, varios viram opcoes, nenhum avisa.
test('tocar no canal do jogo abre o canal ao vivo do provedor, mostra opcoes ou avisa que nao tem', async ({ page }) => {
  const h = (n: number) => new Date(Date.now() + n * 3600_000).toISOString()
  await page.route('**/api/moltv/v1/search?*', (route) => route.fulfill({ json: { results: [{ type: 'team', slug: 'flamengo', name: 'Flamengo' }] } }))
  await page.route('**/api/moltv/v1/teams/flamengo/next', (route) =>
    route.fulfill({
      json: {
        matches: [
          {
            match: { id: 'fd:1', home: 'Flamengo', away: 'Vasco', kickoff: h(-0.5), competition: 'Brasileirão', status: 'scheduled' },
            broadcasts: [
              { channel: 'Esporte Total', slug: 'a', confidence: 'confirmada' },
              { channel: 'Canal', slug: 'b', confidence: 'confirmada' },
              { channel: 'Disney+', slug: 'c', confidence: 'confirmada' },
            ],
          },
        ],
      },
    }),
  )
  await seedSession(page)
  await page.goto('/times')
  await page.getByLabel('Seguir um time').fill('flam')
  await page.getByRole('button', { name: 'Flamengo', exact: true }).click()
  const card = page.getByRole('region', { name: 'Flamengo' })
  await expect(card.getByText('Ao vivo')).toBeVisible()

  await card.getByRole('button', { name: /^Disney\+/ }).click()
  await expect(card.getByText('Seu provedor não tem o canal Disney+.')).toBeVisible()

  await card.getByRole('button', { name: /^Canal,/ }).click()
  await expect(card.getByText(/Seu provedor tem \d+ canais com esse nome/)).toBeVisible()
  await card.getByRole('button', { name: 'Canal Clima' }).click()
  await expect(page).toHaveURL(/\/watch\/live\/103/)
  await page.goBack()

  await card.getByRole('button', { name: /^Esporte Total/ }).click()
  await expect(page).toHaveURL(/\/watch\/live\/201/)
})
