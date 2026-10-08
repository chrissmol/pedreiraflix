import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Tela de canais (08/10): categorias em grupos na lista lateral (computador) e em abas (celular), abrindo em
// Recentes. Antes eram 38 pilulas em caixa alta quebrando em 5 linhas.
test('lista lateral: grupos abrem e fecham e a categoria filtra os canais', async ({ page }) => {
  await seedSession(page)
  await page.goto('/live')
  const lateral = page.getByRole('complementary', { name: 'Categorias' })
  await expect(lateral.getByRole('button', { name: /Todos os canais/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Canal Notícias 24h')).toBeVisible()

  const grupo = lateral.getByRole('button', { name: 'Esportes', exact: true }).first()
  await expect(grupo).toHaveAttribute('aria-expanded', 'false')
  await grupo.click()
  await expect(grupo).toHaveAttribute('aria-expanded', 'true')
  await lateral.getByRole('button', { name: /^Esportes \d/ }).click()
  await expect(page.getByText('Futebol HD')).toBeVisible()
  await expect(page.getByText('Canal Notícias 24h')).toHaveCount(0)
})

test('abre em Recentes depois de assistir um canal', async ({ page }) => {
  await seedSession(page)
  await page.goto('/live')
  await page.getByText('Futebol HD').click()
  await expect(page).toHaveURL(/\/watch\/live\/202/)
  await expect(page.locator('video')).toBeVisible() // o player (pagina carregada sob demanda) ja abriu
  await page.goto('/live')
  const lateral = page.getByRole('complementary', { name: 'Categorias' })
  await expect(lateral.getByRole('button', { name: /Recentes/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Futebol HD')).toBeVisible()
  await expect(page.getByText('Canal Notícias 24h')).toHaveCount(0)
})
