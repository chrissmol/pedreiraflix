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

// Pedido do Chris (10/11): menu enxuto. Itens raros ficam em "Mais" e o menu cabe sem rolagem no celular.
test('menu da conta e compacto: itens raros em "Mais" e sem rolagem', async ({ page }) => {
  await seedSession(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Conta', exact: true }).click()
  const menu = page.getByRole('dialog', { name: 'Menu da conta' })
  await expect(menu.getByRole('button', { name: 'Limpar cache' })).toHaveCount(0)
  await expect(menu.getByRole('button', { name: 'Mais' })).toHaveAttribute('aria-expanded', 'false')
  expect(await menu.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true)
  await menu.getByRole('button', { name: 'Mais' }).click()
  for (const n of ['Limpar cache', 'Diagnóstico', 'Suporte']) await expect(menu.getByRole('button', { name: n })).toBeVisible()
})
