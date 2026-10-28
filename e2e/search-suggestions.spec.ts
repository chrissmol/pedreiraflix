import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('typing in the search box shows live suggestions across movies/series/live', async ({ page }) => {
  await login(page)
  await page.getByPlaceholder('Buscar…').fill('canal')
  await expect(page.getByRole('button', { name: /Canal Notícias 24h.*Canal/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Canal Economia.*Canal/ })).toBeVisible()

  // Clicking a suggestion navigates straight to it and closes the dropdown.
  await page.getByRole('button', { name: /Canal Notícias 24h.*Canal/ }).click()
  await expect(page).toHaveURL(/\/watch\/live\/101/)
})

test('search suggestions do not appear for a one-character query', async ({ page }) => {
  await login(page)
  await page.getByPlaceholder('Buscar…').fill('c')
  await expect(page.getByRole('button', { name: /Canal Notícias/ })).toHaveCount(0)
})

test('clicking outside closes the suggestions dropdown', async ({ page }) => {
  await login(page)
  await page.getByPlaceholder('Buscar…').fill('filme')
  const suggestion = page.locator('form').getByRole('button', { name: /Filme Explosivo/ })
  await expect(suggestion).toBeVisible()
  await page.locator('body').click({ position: { x: 10, y: 300 } })
  await expect(suggestion).toHaveCount(0)
})

// Video do Chris (21/10): digitar o titulo e dar Enter abria o primeiro filme da lista. As sugestoes ficam dentro do
// <form> e eram botoes de envio, entao o Enter "clicava" a primeira. Agora o Enter mostra todos os resultados.
test('Enter com sugestoes abertas mostra os resultados, sem abrir o primeiro filme', async ({ page }) => {
  await login(page)
  const busca = page.getByRole('searchbox', { name: 'Buscar' })
  await busca.fill('filme')
  await expect(page.locator('form').getByRole('button', { name: /Filme Explosivo/ })).toBeVisible()
  await busca.press('Enter')
  await expect(page).toHaveURL(/\/search\?q=filme$/)
  await expect(page.getByRole('heading', { name: 'Resultados para "filme"' })).toBeVisible()
})

test('setas percorrem as sugestoes, Esc fecha, e o campo mostra a busca da pagina', async ({ page }) => {
  await login(page)
  const busca = page.getByRole('searchbox', { name: 'Buscar' })
  await busca.fill('canal')
  const primeira = page.locator('form [data-suggestion]').first()
  await expect(primeira).toBeVisible()
  await busca.press('ArrowDown')
  await expect(primeira).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(busca).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(primeira).toHaveCount(0)

  await page.getByRole('button', { name: 'Limpar busca' }).click()
  await expect(busca).toHaveValue('')
  await page.goto('/search?q=economia')
  await expect(busca).toHaveValue('economia')
  await expect(page.getByText('Canal Economia').first()).toBeVisible()
})

test('mais relevante primeiro, erro de digitacao e buscas recentes', async ({ page }) => {
  await login(page)
  await page.goto('/search?q=explosvo')
  await expect(page.getByRole('button', { name: /Filme Explosivo/ }).first()).toBeVisible()
  await page.getByRole('button', { name: /Filme Explosivo/ }).first().click()
  await expect(page).toHaveURL(/\/movies\/1/)
  // Campo vazio: a lista mostra as buscas recentes deste perfil.
  await page.getByRole('button', { name: 'Limpar busca' }).click()
  await expect(page.locator('form').getByRole('button', { name: 'explosvo' })).toBeVisible()
})

test('Limpar apaga o historico de buscas, no menu do campo e na pagina de busca', async ({ page }) => {
  await login(page)
  const busca = page.getByRole('searchbox', { name: 'Buscar' })
  await busca.fill('explosivo')
  await busca.press('Enter')
  await expect(page).toHaveURL(/\/search\?q=explosivo/)
  await page.goto('/')
  await busca.focus()
  await expect(page.locator('form').getByRole('button', { name: 'explosivo' })).toBeVisible()
  await page.locator('form').getByRole('button', { name: 'Limpar', exact: true }).click()
  await expect(page.locator('form').getByRole('button', { name: 'explosivo' })).toHaveCount(0)

  // Pagina de busca (celular/TV): o mesmo historico some e a mensagem vazia volta.
  await busca.fill('explosivo')
  await busca.press('Enter')
  await page.goto('/search')
  await expect(page.getByRole('button', { name: 'explosivo' })).toBeVisible()
  await page.getByRole('button', { name: 'Limpar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'explosivo' })).toHaveCount(0)
  await expect(page.getByText('Digite o nome de um filme, série ou canal.')).toBeVisible()
})
