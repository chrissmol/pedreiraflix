import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

// App da Samsung (Tizen): o Voltar chega como tecla 10009 e os botoes de midia so pelo keyCode.
test.use({
  userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106.1/5.5 TV Safari/537.36',
  viewport: { width: 960, height: 540 },
})

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

const tecla = (page: Page, keyCode: number) =>
  page.evaluate((keyCode) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true })
    Object.defineProperty(e, 'keyCode', { value: keyCode })
    ;(document.activeElement ?? document.body).dispatchEvent(e)
  }, keyCode)
const VOLTAR = 10009

test('Samsung: o Voltar do controle volta uma tela e sai do player', async ({ page }) => {
  await page.goto('/movies')
  await page.locator('[data-spatial]', { hasText: 'Filme Explosivo' }).first().click()
  await expect(page).toHaveURL(/\/movies\/1$/)
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page).toHaveURL(/\/watch\/movie\/1/)
  await expect(page.getByRole('button', { name: 'Play/Pause' }).first()).toBeAttached()
  await tecla(page, VOLTAR)
  await expect(page).toHaveURL(/\/movies\/1$/)
  await tecla(page, VOLTAR)
  await expect(page).toHaveURL(/\/movies$/)
})

test('Samsung: com o menu da conta aberto o Voltar so fecha o menu', async ({ page }) => {
  await page.goto('/movies')
  await page.locator('[data-spatial]', { hasText: 'Filme Explosivo' }).first().click()
  await expect(page).toHaveURL(/\/movies\/1$/)
  await page.getByRole('button', { name: 'Conta', exact: true }).click()
  const menu = page.getByRole('dialog', { name: 'Menu da conta' })
  await expect(menu).toBeVisible()
  await tecla(page, VOLTAR)
  await expect(menu).toBeHidden()
  await page.waitForTimeout(300)
  await expect(page).toHaveURL(/\/movies\/1$/)
})

test('Samsung: com a lista de canais aberta o Voltar fecha a lista e fica no canal', async ({ page }) => {
  await page.goto('/watch/live/101?name=Canal')
  await expect(page).toHaveURL(/\/watch\/live\/101/)
  const lista = page.getByRole('dialog', { name: 'Lista de canais' })
  // A lista de canais do zapping carrega depois do player; a seta so abre a lista quando ela existe.
  await expect(async () => {
    await page.keyboard.press('ArrowRight')
    await expect(lista).toBeVisible({ timeout: 1000 })
  }).toPass()
  await tecla(page, VOLTAR)
  await expect(lista).toBeHidden()
  await page.waitForTimeout(300)
  await expect(page).toHaveURL(/\/watch\/live\/101/)
})

test('Controle: Play/Pause, avancar e retroceder funcionam no player', async ({ page }) => {
  await page.goto('/movies/1')
  await page.getByRole('button', { name: 'Assistir' }).click()
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.5)).toBe(true)
  await tecla(page, 10252) // Play/Pause da Samsung
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
  const t = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
  // Fire TV manda a tecla ja com nome (o Playwright nao conhece essa tecla, dai o evento na mao)
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'MediaFastForward', bubbles: true, cancelable: true })))
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(t + 5)
  await tecla(page, 412) // retroceder
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(t + 5)
  await tecla(page, 415) // Play
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)
})

test('Controle: Canal + e Canal - trocam de canal no ao vivo', async ({ page }) => {
  await page.goto('/watch/live/101?name=Canal')
  await expect(page).toHaveURL(/\/watch\/live\/101/)
  await expect(page.getByRole('button', { name: 'Lista de canais' })).toBeAttached() // o zapping so existe com a lista carregada
  await tecla(page, 427)
  await expect(page).not.toHaveURL(/\/watch\/live\/101/)
  await tecla(page, 428)
  await expect(page).toHaveURL(/\/watch\/live\/101/)
})
