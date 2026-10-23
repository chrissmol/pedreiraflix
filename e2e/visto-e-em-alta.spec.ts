import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('marcar filme como visto pela pagina, e desmarcar', async ({ page }) => {
  await page.goto('/movies/1')
  const botao = page.getByRole('button', { name: 'Marcar como visto' })
  await botao.click()
  await expect(page.getByText('Assistido', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Visto (desmarcar)' }).click()
  await expect(page.getByText('Assistido', { exact: true })).toHaveCount(0)
  await expect(botao).toBeVisible()
})

test('marcar temporada inteira e um episodio so', async ({ page }) => {
  await page.goto('/series/50')
  await page.getByRole('button', { name: 'Marcar temporada como vista' }).click()
  await expect(page.getByRole('button', { name: 'Temporada vista' })).toBeVisible()
  await expect(page.getByText('Concluído')).toHaveCount(3)
  await page.getByRole('button', { name: 'Desmarcar episódio 2 como visto' }).click()
  await expect(page.getByText('Concluído')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Marcar temporada como vista' })).toBeVisible()
})

test('Em alta: so o que existe no catalogo, pelo nome em portugues ou original', async ({ page }) => {
  await page.route('**/api/em-alta?kind=movie', (route) => route.fulfill({ json: { titles: ['Filme Que Nao Existe', 'Corrida Final'] } }))
  await page.route('**/api/em-alta?kind=tv', (route) => route.fulfill({ json: { titles: ['Drama Series', 'Série Dramática'] } }))
  await page.goto('/')
  const fileira = page.locator('section', { has: page.getByRole('heading', { name: 'Em alta esta semana' }) })
  await expect(fileira.getByRole('button', { name: /Corrida Final/ })).toBeVisible()
  await expect(fileira.getByRole('button', { name: /Série Dramática/ })).toBeVisible()
  await expect(fileira.locator('[data-spatial], button').filter({ hasText: /Filme Explosivo|Outra Série/ })).toHaveCount(0)
})

test('Em alta: sem TMDB (204) a fileira nao aparece', async ({ page }) => {
  await page.route('**/api/em-alta?*', (route) => route.fulfill({ status: 204 }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Adicionados recentemente' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Em alta esta semana' })).toHaveCount(0)
})

test.describe('TV', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })
  test('TV: com setas e OK chega no "Marcar como visto" do filme', async ({ page }) => {
    await page.goto('/movies/1')
    await expect(page.getByRole('button', { name: 'Assistir' })).toBeVisible()
    for (let i = 0; i < 12; i++) {
      const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
      if (label === 'Marcar como visto') break
      await page.keyboard.press(i === 0 ? 'ArrowDown' : 'ArrowRight')
    }
    await page.keyboard.press('Enter')
    await expect(page.getByText('Assistido', { exact: true })).toBeVisible()
  })
})
