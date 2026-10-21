import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test('celular: grupos em abas e categorias do grupo em pilulas', async ({ page }) => {
  await seedSession(page)
  await page.goto('/live')
  await expect(page.getByRole('complementary', { name: 'Categorias' })).toBeHidden()
  await page.getByRole('tab', { name: 'Esportes' }).click()
  await expect(page.getByRole('tab', { name: 'Esportes' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Futebol HD')).toBeVisible()
  await expect(page.getByText('Canal Notícias 24h')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Tudo' })).toHaveAttribute('aria-pressed', 'true')
})

test('celular: abas de grupo com altura para o dedo', async ({ page }) => {
  await seedSession(page)
  await page.goto('/live')
  const aba = (await page.getByRole('tab', { name: 'Esportes' }).boundingBox())!
  expect(aba.height).toBeGreaterThanOrEqual(44)
})

test('celular: aba Campeonatos mostra os canais da Champions', async ({ page }) => {
  await page.route(/action=get_live_streams.*category_id=2/, async (route) => {
    const streams = await (await route.fetch()).json()
    await route.fulfill({ json: [...streams, { ...streams[0], stream_id: 203, name: 'ESPN 4 - Champions League' }] })
  })
  await seedSession(page)
  await page.goto('/live')
  await page.getByRole('tab', { name: 'Campeonatos' }).click()
  await expect(page.getByRole('button', { name: 'Champions League', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('ESPN 4 - Champions League')).toBeVisible()
  await expect(page.getByText('Futebol HD')).toHaveCount(0)
})
