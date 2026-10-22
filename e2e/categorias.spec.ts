import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('perfil esconde uma categoria de canais e ela some da tela de canais', async ({ page }) => {
  await page.goto('/live')
  await expect(page.getByText('Canal Notícias 24h').first()).toBeVisible()

  await page.goto('/categorias')
  await page.getByRole('button', { name: 'Esconder Notícias' }).click()
  await expect(page.getByRole('button', { name: 'Mostrar Notícias' })).toBeVisible()

  await page.goto('/live')
  await expect(page.getByText('Esporte Total').first()).toBeVisible()
  await expect(page.getByText('Canal Notícias 24h')).toHaveCount(0)
})

test('subir uma categoria de filmes muda a ordem das fileiras e o foco fica no botao', async ({ page }) => {
  await page.goto('/categorias')
  await page.getByRole('tab', { name: 'Filmes' }).click()
  await page.getByRole('button', { name: 'Subir Comédia' }).click()
  // Chegou ao topo: Subir fica desativado e o foco passa para Descer, sem se perder (controle da TV).
  await expect(page.getByRole('button', { name: 'Subir Comédia' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Descer Comédia' })).toBeFocused()

  await page.goto('/movies')
  const titulos = page.getByRole('heading', { level: 2 })
  await expect(titulos.filter({ hasText: 'Ação' })).toBeVisible()
  const ordem = await titulos.allTextContents()
  expect(ordem.findIndex((t) => t.includes('Comédia'))).toBeLessThan(ordem.findIndex((t) => t.includes('Ação')))
})

test('Restaurar padrão volta a mostrar e a ordem do provedor', async ({ page }) => {
  await page.goto('/categorias')
  await page.getByRole('button', { name: 'Esconder Esportes' }).click()
  await page.getByRole('button', { name: 'Restaurar padrão' }).click()
  await expect(page.getByRole('button', { name: 'Esconder Esportes' })).toBeVisible()
})
