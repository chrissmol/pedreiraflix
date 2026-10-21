import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

const tocando = (page: Page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('video')).map((v) => ({ playing: v.currentTime > 0 && !v.paused, muted: v.muted })))

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('mosaico: abre pelos canais, toca 2 canais e so o escolhido tem som', async ({ page }) => {
  await page.goto('/live')
  await page.getByRole('button', { name: 'Mosaico' }).click()
  await expect(page).toHaveURL(/\/mosaico/)
  // Conta do mock: 2 telas. O aviso diz o limite e 4 telas fica bloqueado.
  await expect(page.getByTestId('mosaico-telas')).toContainText('limite 2')
  await expect(page.getByRole('button', { name: '4 telas' })).toBeDisabled()

  for (const nome of ['Canal Notícias 24h', 'Canal Economia']) {
    await page.getByRole('button', { name: '+ Escolher canal' }).first().click()
    await page.getByRole('dialog', { name: 'Escolher canal' }).getByRole('button', { name: nome }).first().click()
    await expect(page.getByRole('button', { name: `Ouvir ${nome}` })).toBeVisible()
  }
  await expect(page).toHaveURL(/c=101%2C102|c=101,102/)
  await expect.poll(async () => (await tocando(page)).filter((v) => v.playing).length, { timeout: 20_000 }).toBe(2)
  // O ultimo escolhido fica com o som.
  expect((await tocando(page)).map((v) => v.muted)).toEqual([true, false])

  await page.getByRole('button', { name: 'Ouvir Canal Notícias 24h' }).click()
  await expect.poll(async () => (await tocando(page)).map((v) => v.muted)).toEqual([false, true])

  // Tela cheia e Voltar: volta ao mesmo mosaico.
  await page.getByRole('button', { name: 'Tela cheia: Canal Notícias 24h' }).click()
  await expect(page).toHaveURL(/\/watch\/live\/101/)
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Ouvir Canal Economia' })).toBeVisible()

  // Sair volta para os canais.
  await page.getByRole('button', { name: 'Sair do mosaico' }).click()
  await expect(page).toHaveURL(/\/live$/)
})

test('mosaico: Voltar com a lista de canais aberta so fecha a lista', async ({ page }) => {
  await page.goto('/live')
  await page.goto('/mosaico?n=2&c=101')
  await expect(page.getByRole('button', { name: 'Ouvir Canal Notícias 24h' })).toBeVisible()
  await page.getByRole('button', { name: '+ Escolher canal' }).click()
  await expect(page.getByRole('dialog', { name: 'Escolher canal' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Escolher canal' })).toHaveCount(0)
  await expect(page).toHaveURL(/\/mosaico/)
})

test('mosaico: conta de 1 tela explica que nao da', async ({ page }) => {
  await page.route(/\/api\/xtream(?!.*action=)/, async (route) => {
    const res = await route.fetch()
    const data = await res.json()
    data.user_info.max_connections = '1'
    await route.fulfill({ response: res, json: data })
  })
  await page.goto('/mosaico?n=2&c=101,102')
  await expect(page.getByText(/só permite 1 tela/)).toBeVisible()
  await expect(page.locator('video')).toHaveCount(0)
})

test.describe('TV', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })

  test('mosaico na TV: setas trocam o quadro com som e OK abre a troca de canal', async ({ page }) => {
    await page.goto('/live')
    await page.goto('/mosaico?n=2&c=101,102')
    const focado = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '')
    await expect.poll(focado).toBe('Ouvir Canal Notícias 24h')
    await page.keyboard.press('ArrowRight')
    await expect.poll(focado).toBe('Ouvir Canal Economia')
    await expect.poll(async () => (await tocando(page)).map((v) => v.muted)).toEqual([true, false])
    // OK no quadro mostra os botoes dele, ja com o foco em "Trocar canal"; outro OK abre a lista.
    await page.keyboard.press('Enter')
    await expect.poll(focado).toBe('Trocar canal')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Escolher canal' })).toBeVisible()
    await page.keyboard.press('ArrowDown') // do Fechar para a primeira linha de canais
    for (let i = 0; i < 6 && !/Canal Clima/.test(await focado()); i++) await page.keyboard.press('ArrowRight')
    expect(await focado()).toMatch(/Canal Clima/)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Ouvir Canal Clima' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(960)
  })
})
