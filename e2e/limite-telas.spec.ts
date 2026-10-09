import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

// O provedor diz quantas telas estao em uso no login (sem action); so assim o app culpa o limite.
async function telasCheias(page: Page) {
  await page.route(/\/api\/xtream(?!.*action=)/, async (route) => {
    const res = await route.fetch()
    const data = await res.json()
    data.user_info.active_cons = '2'
    await route.fulfill({ response: res, json: data })
  })
}

// Caso real (06/10): outro aparelho tocando com o mesmo login, o provedor respondeu 403 ao filme e o
// player dizia "formato nao suportado". A mensagem tem que apontar o motivo de verdade.
const LIMIT = /sua conta já está tocando em outro aparelho/

test('filme recusado pelo provedor (403) com as telas cheias avisa do limite', async ({ page }) => {
  await telasCheias(page)
  await page.route(/\/api\/stream\?.*%2Fmovie%2F/, (route) => route.fulfill({ status: 403, body: 'forbidden' }))
  await seedSession(page)
  await page.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await expect(page.getByText(LIMIT)).toBeVisible()
  await expect(page.getByText(/Formato pode não ser suportado/)).toHaveCount(0)
})

test('canal ao vivo recusado pelo provedor (403) com as telas cheias avisa do limite', async ({ page }) => {
  await telasCheias(page)
  await page.route(/\/api\/stream\?.*%2Flive%2F/, (route) => route.fulfill({ status: 403, body: 'forbidden' }))
  await seedSession(page)
  await page.goto('/watch/live/101?name=Canal%20Not%C3%ADcias%2024h')
  await expect(page.getByText(LIMIT)).toBeVisible()
})

test('erro que nao e 403 continua com a mensagem de antes', async ({ page }) => {
  await page.route(/\/api\/stream\?.*%2Fmovie%2F/, (route) => route.fulfill({ status: 200, contentType: 'video/mp4', body: 'nao e video' }))
  await seedSession(page)
  await page.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await expect(page.getByText(/Formato pode não ser suportado/)).toBeVisible()
})

// Teste na conta real (09/10): 403 com 0 de 1 telas em uso era a Cloudflare barrando IP puro ("error code: 1003"),
// e o app dizia "conta tocando em outro aparelho". Sem o provedor confirmar as telas cheias, nao culpa as telas.
test('canal recusado (403) com telas livres nao culpa o limite de telas', async ({ page }) => {
  await page.route(/\/api\/stream\?.*%2Flive%2F/, (route) => route.fulfill({ status: 403, body: 'error code: 1003' }))
  await seedSession(page)
  await page.goto('/watch/live/101?name=Canal%20Not%C3%ADcias%2024h')
  await expect(page.getByText(/O provedor recusou este vídeo \(HTTP 403\)/)).toBeVisible()
  await expect(page.getByText(LIMIT)).toHaveCount(0)
})
