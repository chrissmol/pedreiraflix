import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Suporte: os amigos do Christian contam o que esta acontecendo e o feedback leva perfil, aparelho e a tela de onde veio.
test('suporte: envia o feedback com a tela de onde veio', async ({ page }) => {
  await login(page)
  await page.goto('/movies')
  await page.getByRole('button', { name: 'Conta', exact: true }).click()
  await page.getByRole('button', { name: 'Suporte' }).click()
  await expect(page.getByRole('heading', { name: 'Suporte' })).toBeVisible()

  await page.getByRole('button', { name: 'Sugestão' }).click()
  await page.getByPlaceholder('O que está acontecendo?').fill('Queria legenda maior')
  const req = page.waitForRequest((r) => r.url().includes('/api/feedback') && r.method() === 'POST')
  await page.getByRole('button', { name: 'Enviar' }).click()
  const body = (await req).postDataJSON()
  expect(body).toMatchObject({ tipo: 'Sugestão', texto: 'Queria legenda maior', pagina: '/movies', aparelho: 'Navegador' })
  expect(body.perfil).toBeTruthy()
  await expect(page.getByRole('heading', { name: 'Recebido, valeu!' })).toBeVisible()
})

test('suporte: avisa quando nao deu para enviar', async ({ page }) => {
  await page.route('**/api/feedback', (route) => route.fulfill({ status: 503 }))
  await login(page)
  await page.goto('/suporte')
  await page.getByPlaceholder('O que está acontecendo?').fill('Canal travando')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByRole('alert')).toContainText('Não deu para enviar')
})

test('suporte mostra o credito do TMDB com o logo', async ({ page }) => {
  await login(page)
  await page.goto('/suporte')
  await expect(page.getByAltText('TMDB')).toBeVisible()
  await expect(page.getByText(/não é endossado nem certificado pelo TMDB/)).toBeVisible()
})
