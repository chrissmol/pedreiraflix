import { expect, test } from '@playwright/test'
import { login } from './helpers'

// App do Windows do Christian (09/10): nenhum canal carregava, o circulo de carregamento sumia e a tela ficava vazia
// sem dizer nada. Agora: erro de verdade quando TODAS as categorias falham, e uma tela de diagnostico que mostra o que o
// aparelho recebe do servidor e do provedor.
test('diagnostico: tudo ok contra o painel de teste', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Diagnóstico' }).click()
  await page.getByRole('button', { name: 'Testar agora' }).click()
  await expect(page.getByText('✓ Início de um filme (o pedido do download)')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/✗/)).toHaveCount(0)
})

test('diagnostico: acusa a pagina de bloqueio no lugar dos dados', async ({ page }) => {
  await page.route(/action=get_live_streams/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Attention Required! | Cloudflare</html>' }),
  )
  await login(page)
  await page.goto('/diagnostico')
  await page.getByRole('button', { name: 'Testar agora' }).click()
  await expect(page.getByText('✗ Canais da primeira categoria')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/PÁGINA: <html>Attention Required/)).toBeVisible()
})

test('todas as categorias falham: a tela de canais mostra o erro, nao fica vazia', async ({ page }) => {
  await page.route(/action=get_live_streams/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html>bloqueado</html>' }),
  )
  await login(page)
  await page.goto('/live')
  await expect(page.getByRole('alert').filter({ hasText: 'página em vez dos canais' })).toBeVisible({ timeout: 40000 })
})

test('diagnostico mostra as telas em uso e acusa o limite cheio', async ({ page }) => {
  await page.route(/action=(?!get_)|player_api\.php(?!.*action)/, async (route) => {
    const res = await route.fetch()
    const text = await res.text()
    try {
      const json = JSON.parse(text)
      if (json.user_info) Object.assign(json.user_info, { active_cons: '2', max_connections: '2' })
      await route.fulfill({ response: res, json })
    } catch {
      await route.fulfill({ response: res, body: text })
    }
  })
  await login(page)
  await page.goto('/diagnostico')
  await page.getByRole('button', { name: 'Testar agora' }).click()
  await expect(page.getByText('✗ Telas em uso no provedor')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/2 de 2 telas em uso.*LIMITE CHEIO/)).toBeVisible()
})
