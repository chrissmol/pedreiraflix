import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// O provedor tira filmes e series do ar e responde "info vazio" (nao um erro). A pagina quebrava inteira
// ("Algo deu errado") ao abrir um favorito ou um item de "continuar assistindo" que sumiu.
test('serie removida pelo provedor mostra aviso, nao a tela de erro do app', async ({ page }) => {
  await seedSession(page)
  await page.goto('/series/9999')
  await expect(page.getByText('Este título não está mais disponível no provedor.')).toBeVisible()
  await expect(page.getByText('Algo deu errado')).toHaveCount(0)
})

test('filme removido pelo provedor mostra aviso, nao a tela de erro do app', async ({ page }) => {
  await page.route(/get_vod_info/, (route) => route.fulfill({ json: { info: [], movie_data: [] } }))
  await seedSession(page)
  await page.goto('/movies/9999')
  await expect(page.getByText('Este título não está mais disponível no provedor.')).toBeVisible()
  await expect(page.getByText('Algo deu errado')).toHaveCount(0)
})

// Endereco que nao existe (link antigo, erro de digitacao) deixava a tela preta e vazia.
test('endereco desconhecido volta para o inicio em vez de tela vazia', async ({ page }) => {
  await seedSession(page)
  await page.goto('/endereco-que-nao-existe')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading').first()).toBeVisible()
})
