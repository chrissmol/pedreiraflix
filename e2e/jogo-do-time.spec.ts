import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

const em = (min: number) => new Date(Date.now() + min * 60_000).toISOString()

async function seguir(page: Page, kids = false) {
  await page.route('**/api/moltv/v1/teams/flamengo/next', (route) =>
    route.fulfill({
      json: {
        matches: [
          { match: { id: 'a', home: 'Flamengo', away: 'Vasco', kickoff: em(90), competition: 'Brasileirão', status: 'scheduled' }, broadcasts: [{ channel: 'Globo', slug: 'globo', confidence: 'confirmada' }] },
        ],
      },
    }),
  )
  await page.route('**/api/moltv/v1/teams/palmeiras/next', (route) =>
    route.fulfill({ json: { matches: [{ match: { id: 'b', home: 'Palmeiras', away: 'Santos', kickoff: em(3 * 24 * 60), competition: 'Brasileirão', status: 'scheduled' }, broadcasts: [] }] } }),
  )
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Conta', exact: true })).toBeVisible()
  await page.evaluate((kids) => {
    const profiles = JSON.parse(localStorage.getItem('iptv-profiles')!)
    const acc = Object.values(profiles.state.byAccount)[0] as { activeId: string; profiles: { id: string; isKids?: boolean }[] }
    const id = acc.activeId
    if (kids) acc.profiles.find((p) => p.id === id)!.isKids = true
    localStorage.setItem('iptv-profiles', JSON.stringify(profiles))
    const saved = JSON.parse(localStorage.getItem('iptv-library') ?? '{"state":{},"version":1}')
    saved.state.favoriteTeams = { [id]: [{ slug: 'flamengo', name: 'Flamengo' }, { slug: 'palmeiras', name: 'Palmeiras' }] }
    localStorage.setItem('iptv-library', JSON.stringify(saved))
  }, kids)
  await page.reload()
}

test('Inicio avisa do jogo do time que joga nas proximas 24 h, com o canal; jogo distante nao aparece', async ({ page }) => {
  await seguir(page)
  const aviso = page.getByRole('region', { name: 'Jogo do seu time' })
  await expect(aviso.getByText('Flamengo × Vasco')).toBeVisible()
  await expect(aviso).toContainText('em 1 h 30 min')
  await expect(aviso).toContainText('Globo')
  await expect(aviso.getByText('Palmeiras × Santos')).toHaveCount(0)
  await aviso.getByRole('link').click()
  await expect(page).toHaveURL(/\/times/)
})

test('perfil infantil nao ve o aviso nem busca jogos', async ({ page }) => {
  const pedidos: string[] = []
  page.on('request', (r) => pedidos.push(r.url()))
  await seguir(page, true)
  await expect(page.getByRole('heading', { name: 'Novidades em filmes' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Jogo do seu time' })).toHaveCount(0)
  expect(pedidos.filter((u) => u.includes('/teams/') && u.includes('/next'))).toEqual([])
})
