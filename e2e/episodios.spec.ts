import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

const abrirEpisodio2 = (page: Page) => page.goto(`/watch/series/5012?ext=mp4&name=${encodeURIComponent('Série Dramática - T1E2 - Episódio 2')}&seriesId=50`)

test('painel Episodios: lista a temporada atual, troca de temporada e toca o escolhido', async ({ page }) => {
  await abrirEpisodio2(page)
  await page.locator('video').hover()
  await page.getByRole('button', { name: 'Episódios' }).click()
  const painel = page.getByRole('dialog', { name: 'Episódios' })
  await expect(painel.getByText('Temporada 1')).toBeVisible()
  await expect(painel.locator('[aria-current]')).toHaveAttribute('data-id', '5012')
  await expect(painel.getByText('Plot 1x2')).toBeVisible()
  await expect(painel.locator('li')).toHaveCount(3)

  await painel.getByRole('button', { name: 'Próxima temporada' }).click()
  await expect(painel.getByText('Temporada 2')).toBeVisible()
  await painel.getByText('T2E1 - Episódio 1').click()
  await expect(page).toHaveURL(/\/watch\/series\/5021\?/)
  await expect(painel).toHaveCount(0)
})

test('filme e ao vivo nao tem botao Episodios', async ({ page }) => {
  await page.goto('/watch/movie/1?ext=mp4&name=Filme')
  await page.locator('video').hover()
  await expect(page.getByRole('button', { name: 'Play/Pause' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Episódios' })).toHaveCount(0)
})

test.describe('TV', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })

  test('so com setas e OK: abre, anda, troca de temporada, Voltar fecha e OK toca', async ({ page }) => {
    await abrirEpisodio2(page)
    await expect(page.getByRole('button', { name: 'Episódios' })).toHaveCount(1)
    const focado = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.getAttribute('data-id'))
    await page.keyboard.press('Enter') // mostra os controles e foca o Play/Pause
    for (let i = 0; i < 10 && (await focado()) !== 'Episódios'; i++) await page.keyboard.press('ArrowRight')
    expect(await focado()).toBe('Episódios')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/episodios=1/)
    await expect.poll(focado).toBe('5012') // foco ja no episodio que esta passando

    await page.keyboard.press('ArrowDown')
    expect(await focado()).toBe('5013')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('dialog').getByText('Temporada 2')).toBeVisible()
    await expect.poll(focado).toBe('5021')
    await page.keyboard.press('Escape') // Voltar do controle
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(/\/watch\/series\/5012\?(?!.*episodios)/)

    await page.keyboard.press('Enter')
    for (let i = 0; i < 10 && (await focado()) !== 'Episódios'; i++) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect.poll(focado).toBe('5012')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/watch\/series\/5013\?/)
  })
})
