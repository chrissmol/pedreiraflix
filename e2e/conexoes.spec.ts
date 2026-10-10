import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Pedido do Christian (07/10): sem poder assistir por causa do limite de telas do provedor, sem ver o motivo.
// O login do Xtream ja traz "conexoes ativas / maximo"; o menu da conta passa a mostrar.
// Depois do login a pagina inicial carrega por lazy-load e recria a barra do topo; um clique que cai nessa janela
// abre o menu e ele some junto. Mediu-se: 5 falhas em 30 execucoes, sempre com o menu fechado. Entao o teste
// clica de novo ate o menu ficar aberto.
async function openAccountMenu(page: import('@playwright/test').Page) {
  const menu = page.getByRole('dialog', { name: 'Menu da conta' })
  await expect(async () => {
    if (!(await menu.isVisible())) await page.getByRole('button', { name: 'Conta', exact: true }).click()
    await expect(menu).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
}

async function mockConnections(page: import('@playwright/test').Page, sequence: number[]) {
  let calls = 0
  await page.route(/\/api\/xtream\?(?!.*action=)/, async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    json.user_info.active_cons = String(sequence[Math.min(calls++, sequence.length - 1)])
    json.user_info.max_connections = '2'
    await route.fulfill({ response: res, json })
  })
}

test('o menu da conta mostra quantas telas estao em uso', async ({ page }) => {
  await mockConnections(page, [1])
  await login(page)
  await openAccountMenu(page)
  const box = page.getByTestId('conexoes')
  await expect(box).toContainText('Telas em uso: 1 de 2')
  await expect(box).not.toContainText('Limite cheio')
})

test('limite cheio avisa, e abrir o menu atualiza o numero', async ({ page }) => {
  // Login vê 1 de 2; quando o menu abre e atualiza, outro aparelho ja ligou: 2 de 2.
  await mockConnections(page, [1, 2])
  await login(page)
  await openAccountMenu(page)
  const box = page.getByTestId('conexoes')
  await expect(box).toContainText('Telas em uso: 2 de 2')
  await expect(box).toContainText('Limite cheio')
})
