import { expect, test } from '@playwright/test'
import { MOCK } from './helpers'

// Paineis Xtream que fogem do padrao do mock: auth em texto, sem server_info, ids em texto, lista vazia como null e
// lista como objeto { "0": {...} }. Antes o login recusava ("1" !== 1) ou quebrava lendo server_info.
test('login e catalogo funcionam com painel Xtream fora do padrao', async ({ page }) => {
  await page.route('**/api/xtream?**', (route) => {
    const action = new URL(route.request().url()).searchParams.get('action')
    const body: Record<string, unknown> = {
      '': { user_info: { username: MOCK.username, status: 'Active', exp_date: null, is_trial: '0', active_cons: '0', max_connections: '1', auth: '1' } },
      get_vod_categories: { '0': { category_id: 7, category_name: 'Estranhos' } },
      get_vod_streams: [{ stream_id: '42', name: 'Filme Fora do Padrao', stream_icon: null, category_id: 7, rating: null, added: null, container_extension: 'mp4' }],
      get_live_categories: null,
      get_series_categories: {},
    }
    return route.fulfill({ json: body[action ?? ''] ?? [] })
  })
  await page.goto('/login')
  await page.getByLabel('Endereço do servidor').fill(MOCK.baseUrl)
  await page.getByLabel('Usuário', { exact: true }).fill(MOCK.username)
  await page.getByLabel('Senha', { exact: true }).fill(MOCK.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/movies')
  await expect(page.getByText('Filme Fora do Padrao').first()).toBeVisible()
})

test('colar o link inteiro do provedor no endereco preenche usuario e senha', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Endereço do servidor').fill(` ${MOCK.baseUrl}/get.php?username=${MOCK.username}&password=${MOCK.password}&type=m3u_plus `)
  await expect(page.getByLabel('Endereço do servidor')).toHaveValue(MOCK.baseUrl)
  await expect(page.getByLabel('Usuário', { exact: true })).toHaveValue(MOCK.username)
  await expect(page.getByLabel('Senha', { exact: true })).toHaveValue(MOCK.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('endereco com /player_api.php no fim e link M3U sem http entram', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Endereço do servidor').fill(`${MOCK.baseUrl.toUpperCase()}/player_api.php`)
  await page.getByLabel('Usuário', { exact: true }).fill(` ${MOCK.username} `)
  await page.getByLabel('Senha', { exact: true }).fill(MOCK.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await page.getByRole('button', { name: 'Link M3U' }).click()
  await page.getByLabel('Link da playlist M3U').fill(`  ${MOCK.baseUrl.replace('http://', '')}/playlist.m3u `)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
})
