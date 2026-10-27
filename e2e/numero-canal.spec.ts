import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('tela de canais: digitar o numero abre o canal e mostra o numero no cartao', async ({ page }) => {
  await page.goto('/live')
  await expect(page.getByTestId('live-card-202')).toContainText('5')
  await page.locator('body').click({ position: { x: 5, y: 300 } })
  await page.keyboard.press('5')
  await expect(page.getByRole('status').filter({ hasText: 'Canal 5' })).toBeVisible()
  await expect(page).toHaveURL(/\/watch\/live\/202/)
})

test('player ao vivo: digitar 4 troca para o canal 4; numero que nao existe avisa e fica no canal', async ({ page }) => {
  await page.goto('/watch/live/101?name=Canal')
  await expect(page.locator('video')).toBeAttached()
  // A lista de canais do zapping carrega em segundo plano.
  await page.waitForTimeout(1000)
  await page.keyboard.press('4')
  await expect(page).toHaveURL(/\/watch\/live\/201/)
  await page.keyboard.press('9')
  await page.keyboard.press('9')
  await expect(page.getByText('Canal 99 não existe')).toBeVisible()
  await expect(page).toHaveURL(/\/watch\/live\/201/)
})

test('digito dentro da busca de canais nao troca de canal', async ({ page }) => {
  await page.goto('/live')
  await expect(page.getByTestId('live-card-101')).toBeVisible()
  await page.getByPlaceholder(/Buscar/).first().fill('2')
  await page.waitForTimeout(2000)
  await expect(page).toHaveURL(/\/live/)
})

test.describe('TV', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })
  test('TV: numero digitado no controle troca de canal no player', async ({ page }) => {
    await page.goto('/watch/live/101?name=Canal')
    await expect(page.locator('video')).toBeAttached()
    await page.waitForTimeout(1000)
    await page.keyboard.press('2')
    await expect(page).toHaveURL(/\/watch\/live\/102/)
  })
})
