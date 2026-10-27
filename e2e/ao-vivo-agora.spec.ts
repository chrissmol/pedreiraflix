import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

/** Canais recentes e favoritos gravados direto no perfil ativo. */
async function seed(page: Page, recent: number[], favorite?: { id: number; name: string }) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Conta', exact: true })).toBeVisible()
  await page.evaluate(
    ({ recent, favorite }) => {
      const { byAccount } = JSON.parse(localStorage.getItem('iptv-profiles')!).state
      const id = (Object.values(byAccount)[0] as { activeId: string }).activeId
      const saved = JSON.parse(localStorage.getItem('iptv-library') ?? '{"state":{},"version":1}')
      saved.state.recentLive = { [id]: recent }
      if (favorite) saved.state.favorites = { [id]: [{ kind: 'live', id: favorite.id, name: favorite.name, image: null }] }
      localStorage.setItem('iptv-library', JSON.stringify(saved))
    },
    { recent, favorite },
  )
  await page.reload()
}

test('Ao vivo agora: favoritos primeiro, depois recentes, com o programa no ar; abre o canal', async ({ page }) => {
  await seed(page, [201, 102], { id: 103, name: 'Canal Clima' })
  const fileira = page.locator('section', { has: page.getByRole('heading', { name: 'Ao vivo agora' }) })
  const cards = fileira.locator('[data-testid^="live-card-"]')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(0)).toHaveAttribute('data-testid', 'live-card-103')
  await expect(cards.nth(1)).toHaveAttribute('data-testid', 'live-card-201')
  await expect(fileira.getByText(/Programa \d+h\d+ \(201\)/)).toBeVisible()
  await fileira.getByTestId('live-card-201').locator('[data-spatial]').click()
  await expect(page).toHaveURL(/\/watch\/live\/201/)
})

test('Ao vivo agora: sem canal recente nem favorito a fileira nao aparece e a lista de canais nao carrega', async ({ page }) => {
  const pedidos: string[] = []
  page.on('request', (r) => pedidos.push(r.url()))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Adicionados recentemente' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ao vivo agora' })).toHaveCount(0)
  expect(pedidos.filter((u) => u.includes('get_live_'))).toEqual([])
})

test.describe('TV', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })
  test('TV: com setas chega no canal da fileira Ao vivo agora e abre com OK', async ({ page }) => {
    await seed(page, [202])
    await expect(page.getByRole('heading', { name: 'Ao vivo agora' })).toBeVisible()
    for (let i = 0; i < 20; i++) {
      const inRow = await page.evaluate(() => !!document.activeElement?.closest('[data-testid="live-card-202"]'))
      if (inRow) break
      await page.keyboard.press('ArrowDown')
    }
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/watch\/live\/202/)
  })
})
