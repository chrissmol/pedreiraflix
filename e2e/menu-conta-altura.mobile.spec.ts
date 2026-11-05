import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// No celular o menu da conta não pode passar por baixo da barra de abas: o "Sair" precisa ficar alcançável.
test('menu da conta termina acima da barra de abas e rola até o Sair', async ({ page }) => {
  await seedSession(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Conta', exact: true }).click()
  const menu = page.getByRole('dialog', { name: 'Menu da conta' })
  const nav = page.locator('nav').filter({ hasText: 'Esportes' }).last()
  const m = (await menu.boundingBox())!
  const n = (await nav.boundingBox())!
  expect(m.y + m.height).toBeLessThanOrEqual(n.y)
  const sair = menu.getByRole('button', { name: 'Sair' })
  await sair.scrollIntoViewIfNeeded()
  const s = (await sair.boundingBox())!
  expect(s.y + s.height).toBeLessThanOrEqual(n.y)
})
