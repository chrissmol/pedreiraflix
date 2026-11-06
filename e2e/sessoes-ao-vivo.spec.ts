import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Provedor IPTV real redireciona /live/u/p/ID.m3u8 para uma URL com token novo, e cada pedido ao endereco original
// vira uma sessao (tela) no provedor. O app nao pode repetir o endereco original a cada recarga da lista (2 s).
const MOCK = 'http://localhost:8790'
const sessoes = async (page: import('@playwright/test').Page) => (await (await page.request.get(`${MOCK}/__mock/live-sessions`)).json()) as string[]

test.beforeEach(async ({ page }) => {
  await page.request.get(`${MOCK}/__mock/live-redirect?on=1`)
  await seedSession(page)
})
test.afterEach(async ({ page }) => {
  await page.request.get(`${MOCK}/__mock/live-redirect?on=0`)
})

test('canal ao vivo abre 1 sessao no provedor, nao uma por recarga da lista', async ({ page }) => {
  await page.goto('/watch/live/101?name=A')
  await page.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 1, null, { timeout: 15000 })
  await page.waitForTimeout(8000) // ~4 recargas da lista
  expect(await sessoes(page)).toEqual(['101.m3u8'])
})

test('mosaico com 2 canais abre 1 sessao por canal', async ({ page }) => {
  await page.goto('/live')
  await page.getByRole('button', { name: 'Mosaico' }).click()
  for (const nome of ['Canal Notícias 24h', 'Canal Economia']) {
    await page.getByRole('button', { name: '+ Escolher canal' }).first().click()
    await page.getByRole('dialog', { name: 'Escolher canal' }).getByRole('button', { name: nome }).first().click()
  }
  await page.waitForTimeout(8000)
  expect((await sessoes(page)).sort()).toEqual(['101.m3u8', '102.m3u8'])
})

test('zapear por varios canais seguidos so abre sessao no canal onde parou', async ({ page }) => {
  await page.goto('/watch/live/101?name=A')
  await expect.poll(() => sessoes(page)).toEqual(['101.m3u8'])
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(150)
  }
  await expect(page).toHaveURL(/\/watch\/live\/201/)
  await page.waitForTimeout(4000)
  // Canais 102 e 103 foram so de passagem: abrir cada um deixava uma tela ocupada no provedor sem ninguem assistindo.
  expect(await sessoes(page)).toEqual(['101.m3u8', '201.m3u8'])
})
