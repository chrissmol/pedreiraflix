import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

async function seed(page: Page, seriesDone: Record<string, unknown>) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Conta', exact: true })).toBeVisible()
  await page.evaluate((seriesDone) => {
    const { byAccount } = JSON.parse(localStorage.getItem('iptv-profiles')!).state
    const id = (Object.values(byAccount)[0] as { activeId: string }).activeId
    const saved = JSON.parse(localStorage.getItem('iptv-library') ?? '{"state":{},"version":1}')
    saved.state.seriesDone = Object.fromEntries(Object.entries(seriesDone).map(([k, v]) => [`${id}:${k}`, v]))
    localStorage.setItem('iptv-library', JSON.stringify(saved))
  }, seriesDone)
  await page.reload()
}

test('Novos episódios: so a serie terminada que cresceu, com quantos sao novos', async ({ page }) => {
  // O mock tem 6 episodios em cada serie: a 50 foi terminada com 4, a 51 com todos os 6.
  await seed(page, { '50': { episodes: 4, done: true, at: 2 }, '51': { episodes: 6, done: true, at: 1 } })
  const fileira = page.locator('section', { has: page.getByRole('heading', { name: 'Novos episódios' }) })
  await expect(fileira.locator('[data-spatial]')).toHaveCount(1)
  await expect(fileira.getByRole('button', { name: /Série Dramática/ })).toContainText('2 episódios novos')
  await fileira.getByRole('button', { name: /Série Dramática/ }).click()
  await expect(page).toHaveURL(/\/series\/50/)
  await expect(page.getByText('Novos episódios')).toBeVisible()
})

test('Novos episódios: sem serie nova a fileira nao aparece', async ({ page }) => {
  await seed(page, { '51': { episodes: 6, done: true, at: 1 } })
  await expect(page.getByRole('heading', { name: 'Adicionados recentemente' })).toBeVisible()
  await page.waitForTimeout(1000)
  await expect(page.getByRole('heading', { name: 'Novos episódios' })).toHaveCount(0)
})
