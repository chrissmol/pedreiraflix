import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Caso real (06/10): outro aparelho tocando com o mesmo login, o provedor respondeu 403 ao filme e o
// player dizia "formato nao suportado". A mensagem tem que apontar o motivo de verdade.
const LIMIT = /sua conta já está tocando em outro aparelho/

test('filme recusado pelo provedor (403) avisa do limite de telas', async ({ page }) => {
  await page.route(/\/api\/stream\?url=.*%2Fmovie%2F/, (route) => route.fulfill({ status: 403, body: 'forbidden' }))
  await seedSession(page)
  await page.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await expect(page.getByText(LIMIT)).toBeVisible()
  await expect(page.getByText(/Formato pode não ser suportado/)).toHaveCount(0)
})

test('canal ao vivo recusado pelo provedor (403) avisa do limite sem ficar tentando', async ({ page }) => {
  await page.route(/\/api\/stream\?url=.*%2Flive%2F/, (route) => route.fulfill({ status: 403, body: 'forbidden' }))
  await seedSession(page)
  await page.goto('/watch/live/101?name=Canal%20Not%C3%ADcias%2024h')
  await expect(page.getByText(LIMIT)).toBeVisible()
})

test('erro que nao e 403 continua com a mensagem de antes', async ({ page }) => {
  await page.route(/\/api\/stream\?url=.*%2Fmovie%2F/, (route) => route.fulfill({ status: 200, contentType: 'video/mp4', body: 'nao e video' }))
  await seedSession(page)
  await page.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await expect(page.getByText(/Formato pode não ser suportado/)).toBeVisible()
})
