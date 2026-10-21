import { expect, test } from '@playwright/test'
import { login, seedSession } from './helpers'

// Pedido do Chris (21/10): ver no menu da conta quanto falta para a assinatura do provedor acabar.
// O login do Xtream traz user_info.exp_date (segundos); abrir o menu atualiza o login.
async function openAccountMenu(page: import('@playwright/test').Page) {
  const menu = page.getByRole('dialog', { name: 'Menu da conta' })
  await expect(async () => {
    if (!(await menu.isVisible())) await page.getByRole('button', { name: 'Conta', exact: true }).click()
    await expect(menu).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  return menu
}

async function mockExpDate(page: import('@playwright/test').Page, expDate: string | null) {
  await page.route(/\/api\/xtream\?(?!.*action=)/, async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    json.user_info.exp_date = expDate
    await route.fulfill({ response: res, json })
  })
}

const inDays = (d: number) => String(Math.floor(Date.now() / 1000) + d * 86400 - 60)

test('mostra quantos dias faltam e a data', async ({ page }) => {
  await mockExpDate(page, inDays(23))
  await login(page)
  await openAccountMenu(page)
  const box = page.getByTestId('assinatura')
  await expect(box).toContainText('Assinatura: faltam 23 dias')
  await expect(box).toContainText(/Vence em \d{2}\/\d{2}\/\d{4}\.$/)
})

test('faltando 7 dias ou menos avisa para renovar', async ({ page }) => {
  await mockExpDate(page, inDays(1))
  await login(page)
  await openAccountMenu(page)
  const box = page.getByTestId('assinatura')
  await expect(box).toContainText('Assinatura: falta 1 dia')
  await expect(box).toContainText('Renove com o provedor')
})

test('assinatura vencida', async ({ page }) => {
  await mockExpDate(page, inDays(-2))
  await login(page)
  await openAccountMenu(page)
  await expect(page.getByTestId('assinatura')).toContainText('Assinatura vencida')
})

test('conta sem data de vencimento nao da erro', async ({ page }) => {
  await mockExpDate(page, null)
  await login(page)
  await openAccountMenu(page)
  await expect(page.getByTestId('assinatura')).toContainText('Assinatura sem vencimento')
})

test.describe('TV', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })

  test('TV: o menu mostra a assinatura, cabe na tela e as setas chegam ao fim do menu', async ({ page }) => {
    // Na TV a sessao ja vem salva (como no tv.spec); abrir o menu busca o login de novo e traz a data.
    await mockExpDate(page, inDays(23))
    await seedSession(page)
    await page.goto('/')
    const menu = await openAccountMenu(page)
    await expect(page.getByTestId('assinatura')).toContainText('faltam 23 dias')
    const box = (await menu.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(540)
    const sair = menu.getByRole('button', { name: /Sair/ })
    for (let i = 0; i < 12 && !(await sair.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('ArrowDown')
    await expect(sair).toBeFocused()
  })
})
