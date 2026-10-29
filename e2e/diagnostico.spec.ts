import { expect, test } from '@playwright/test'
import { login } from './helpers'

// App do Windows do Christian (09/10): nenhum canal carregava, o circulo de carregamento sumia e a tela ficava vazia
// sem dizer nada. Agora: erro de verdade quando TODAS as categorias falham, e uma tela de diagnostico que mostra o que o
// aparelho recebe do servidor e do provedor.
test('diagnostico: tudo ok contra o painel de teste', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Conta', exact: true }).click()
  await page.getByRole('button', { name: 'Diagnóstico' }).click()
  await page.getByRole('button', { name: 'Testar agora' }).click()
  await expect(page.getByText('✓ Início de um filme (o pedido do download)')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('ac3 · 6 canais (5.1(side))')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText(/✗/)).toHaveCount(0)
  await expect(page.getByTestId('origem').first()).toHaveText('Player')
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
  await expect(page.getByTestId('origem').filter({ hasText: 'Problema do provedor' }).first()).toBeVisible()
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

// O provedor manda alguns canais como lista "fechada" (1 trecho + ENDLIST) no lugar do canal (Record, 09/10): o
// diagnostico tem que dizer que e bloqueio, nao "tudo ok".
test('diagnostico acusa canal ao vivo bloqueado (lista fechada) e mostra o servidor', async ({ page }) => {
  await page.route(/\/api\/stream\?.*%2Flive%2F/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.apple.mpegurl',
      body: '#EXTM3U\n#EXT-X-TARGETDURATION:11\n#EXTINF:10.0,\n/api/stream?url=http%3A%2F%2Fbloqueio.example%2Fauth%2Ftoken\n#EXT-X-ENDLIST\n',
    }),
  )
  await login(page)
  await page.goto('/diagnostico')
  await page.getByRole('button', { name: 'Testar agora' }).click()
  await expect(page.getByText('✗ Início de um canal ao vivo (a lista do canal)')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/BLOQUEADO.*via bloqueio\.example/)).toBeVisible()
})

test('diagnostico mostra a recusa do canal (403) com o texto do Cloudflare', async ({ page }) => {
  await page.route(/\/api\/stream\?.*%2Flive%2F/, (route) => route.fulfill({ status: 403, body: 'error code: 1003' }))
  await login(page)
  await page.goto('/diagnostico')
  await page.getByRole('button', { name: 'Testar agora' }).click()
  await expect(page.getByText(/HTTP 403 · RECUSADO.*error code: 1003/)).toBeVisible({ timeout: 30000 })
})

// 21/10: o 1o canal da 1a categoria veio bloqueado e o diagnostico deu ✗, mas o provedor bloqueia canal por canal:
// com outro canal ao vivo, nao e a conta nem o app.
test('diagnostico: um canal bloqueado com outros ao vivo nao acusa erro', async ({ page }) => {
  await page.route(/\/api\/stream\?.*%2Flive%2F/, (route) =>
    /101\.m3u8/.test(decodeURIComponent(route.request().url()))
      ? route.fulfill({
          status: 200,
          contentType: 'application/vnd.apple.mpegurl',
          body: '#EXTM3U\n#EXT-X-TARGETDURATION:11\n#EXTINF:10.0,\n/api/stream?url=http%3A%2F%2Fbloqueio.example%2Fauth%2Ftoken\n#EXT-X-ENDLIST\n',
        })
      : route.continue(),
  )
  await login(page)
  await page.goto('/diagnostico')
  await page.getByRole('button', { name: 'Testar agora' }).click()
  await expect(page.getByText('✓ Início de um canal ao vivo (a lista do canal)')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText(/2 de 3 canais ao vivo.*bloqueou só naquele canal.*Canal 1: HTTP 200 · BLOQUEADO/)).toBeVisible()
})
