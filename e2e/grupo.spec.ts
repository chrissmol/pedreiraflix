import { expect, test } from '@playwright/test'

// Codigo do grupo: com GROUP_CODE no Worker o app pede o codigo uma vez antes de tudo e recarrega quando acerta.
// O painel falso dos testes nao tem o secret, entao o /api/grupo e simulado aqui.
test('pede o codigo do grupo, recusa o errado e libera o certo', async ({ page }) => {
  // Simula o navegador que nao guarda o cookie (TV Samsung): so vale o hash que o app manda em x-grupo.
  await page.route('**/api/grupo', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { required: true, ok: route.request().headers()['x-grupo'] === 'hash-do-grupo' } })
    return route.request().postDataJSON().codigo === 'pedreira' ? route.fulfill({ json: { token: 'hash-do-grupo' } }) : route.fulfill({ status: 403 })
  })
  await page.goto('/')
  const campo = page.getByRole('textbox', { name: 'Código do grupo' })
  await expect(campo).toBeVisible()
  await campo.fill('outro')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('alert')).toHaveText('Código errado')
  await campo.fill('pedreira')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(campo).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Conecte sua conta ou lista' })).toBeVisible()
})

test('sem o secret no Worker o codigo nao aparece', async ({ page }) => {
  await page.route('**/api/grupo', (route) => route.fulfill({ json: { required: false, ok: true } }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Conecte sua conta ou lista' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Código do grupo' })).toHaveCount(0)
})
