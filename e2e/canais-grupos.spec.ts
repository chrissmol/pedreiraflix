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

test('tira um canal dos Recentes e limpa a lista', async ({ page }) => {
  await seedSession(page)
  await page.goto('/live')
  for (const nome of ['Futebol HD', 'Canal Notícias 24h']) {
    await page.getByText(nome).first().click()
    await expect(page.locator('video')).toBeVisible()
    await page.goto('/live')
    await page.getByRole('complementary', { name: 'Categorias' }).getByRole('button', { name: /Todos os canais/ }).click()
  }
  await page.goto('/live')
  const lateral = page.getByRole('complementary', { name: 'Categorias' })
  await expect(lateral.getByRole('button', { name: /Recentes 2/ })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Tirar Futebol HD dos recentes' }).click()
  await expect(lateral.getByRole('button', { name: /Recentes 1/ })).toBeVisible()
  await expect(page.getByText('Futebol HD')).toHaveCount(0)

  await page.getByRole('button', { name: 'Limpar recentes' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Limpar' }).click()
  await expect(lateral.getByRole('button', { name: /Recentes/ })).toHaveCount(0)
  await expect(lateral.getByRole('button', { name: /Todos os canais/ })).toHaveAttribute('aria-pressed', 'true')
})

// Sugestao pelo Suporte (21/10): campeonatos juntam os canais que citam o campeonato no nome ou na categoria.
test('campeonatos: Champions junta os canais que citam a Champions', async ({ page }) => {
  await page.route(/action=get_live_streams.*category_id=2/, async (route) => {
    const streams = await (await route.fetch()).json()
    await route.fulfill({ json: [...streams, { ...streams[0], stream_id: 203, name: 'ESPN 4 - Champions League' }] })
  })
  await seedSession(page)
  await page.goto('/live')
  const lateral = page.getByRole('complementary', { name: 'Categorias' })
  await lateral.getByRole('button', { name: 'Campeonatos', exact: true }).click()
  await lateral.getByRole('button', { name: /^Champions League 1/ }).click()
  await expect(page.getByText('ESPN 4 - Champions League')).toBeVisible()
  await expect(page.getByText('Futebol HD')).toHaveCount(0)
  // Campeonato sem canal nenhum nao aparece.
  await expect(lateral.getByRole('button', { name: /Libertadores/ })).toHaveCount(0)
})
