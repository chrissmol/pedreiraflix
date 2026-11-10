import { type Browser, devices, expect, test } from '@playwright/test'
import { login } from './helpers'

// Login na TV pelo celular: a TV (Fire TV, 960x540) mostra QR + codigo, o celular (Pixel 7, outro navegador) confirma
// a conta e a TV entra sozinha. Servidor de teste: pareamento em memoria (server/index.js).
test.use({
  userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
  viewport: { width: 960, height: 540 },
})

async function celular(browser: Browser, grupo?: string) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], baseURL: 'http://localhost:5173' })
  const page = await ctx.newPage()
  if (grupo) await page.addInitScript((g) => localStorage.setItem('pf_grupo', g), grupo)
  await login(page)
  return page
}

test('TV mostra QR e codigo; o celular confirma e a TV entra sem digitar nada', async ({ page, browser }) => {
  const bodies: string[] = []
  page.on('request', (r) => r.url().includes('/api/parear') && bodies.push(r.postData() ?? ''))
  await page.goto('/login')
  await expect(page.getByTestId('parear-qr').locator('svg')).toBeVisible()
  const code = (await page.getByTestId('parear-codigo').innerText()).replace('-', '')
  expect(code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{8}$/)

  const phone = await celular(browser)
  await phone.goto(`/parear?c=${code}`) // o que o QR abre
  const msgPhone = phone.getByRole('status')
  await phone.getByRole('button', { name: /demo.*Enviar para a TV|demo/ }).first().click()
  await expect(msgPhone).toContainText('Pronto')

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Conta', exact: true })).toBeVisible()
  // usuario e senha nunca passaram em claro pelo Worker
  expect(bodies.join('\n')).not.toContain('demo123')

  // uso unico: o mesmo codigo nao vale de novo
  await phone.reload()
  await phone.getByRole('textbox', { name: 'Código da TV' }).fill(code)
  await phone.getByRole('button', { name: /demo/ }).first().click()
  await expect(phone.getByRole('alert')).toContainText(/expirou|não encontrado/)
  await phone.context().close()
})

test('TV sem login ainda deixa digitar usuario e senha como antes', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByTestId('parear-qr')).toBeVisible()
  await expect(page.getByLabel('Endereço do servidor')).toBeAttached()
})

test('com o codigo do grupo ligado, o QR da TV entrega tambem o grupo', async ({ page, browser }) => {
  await page.route('**/api/grupo', (route) => route.fulfill({ json: { required: true, ok: route.request().headers()['x-grupo'] === 'hash-do-grupo' } }))
  await page.goto('/')
  await expect(page.getByRole('textbox', { name: 'Código do grupo' })).toBeVisible()
  const code = (await page.getByTestId('parear-codigo').innerText()).replace('-', '')

  const phone = await celular(browser, 'hash-do-grupo')
  await phone.goto(`/parear?c=${code}`)
  await phone.getByRole('button', { name: /demo/ }).first().click()
  await expect(phone.getByRole('status')).toContainText('Pronto')

  await expect(page.getByRole('textbox', { name: 'Código do grupo' })).toBeHidden({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Conta', exact: true })).toBeVisible()
  await phone.context().close()
})
