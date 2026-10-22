import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('ao vivo: lista de canais por cima do video troca de canal e Esc fecha sem sair do player', async ({ page }) => {
  await page.goto('/live')
  await page.getByText('Canal Notícias 24h').first().click()
  await expect(page).toHaveURL(/\/watch\/live\/101/)

  await page.mouse.move(400, 300)
  await page.getByRole('button', { name: 'Lista de canais' }).click()
  const lista = page.getByRole('dialog', { name: 'Lista de canais' })
  await expect(lista).toBeVisible()
  await expect(lista.getByText('Notícias', { exact: true })).toBeVisible()
  // O canal que esta passando ja vem focado.
  await expect(lista.getByRole('button', { name: 'Canal Notícias 24h' })).toBeFocused()

  // Esc fecha e continua no mesmo canal.
  await page.keyboard.press('Escape')
  await expect(lista).toHaveCount(0)
  await expect(page).toHaveURL(/\/watch\/live\/101(\?|$)/)

  // Seta para a direita abre de novo; seta para baixo e OK escolhem o proximo canal sem zapear o video.
  await page.keyboard.press('ArrowRight')
  await expect(lista).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(lista.getByRole('button', { name: 'Canal Economia' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/watch\/live\/102/)
  await expect(lista).toHaveCount(0)
})

test('ao vivo: esquerda/direita na lista trocam de categoria', async ({ page }) => {
  await page.goto('/live')
  await page.getByText('Canal Notícias 24h').first().click()
  await expect(page).toHaveURL(/\/watch\/live\/101/)
  const lista = page.getByRole('dialog', { name: 'Lista de canais' })
  // A lista do zapping carrega depois do player; a seta so abre a lista quando ela existe.
  await expect(async () => {
    await page.keyboard.press('ArrowLeft')
    await expect(lista).toBeVisible({ timeout: 1000 })
  }).toPass()
  await page.keyboard.press('ArrowRight')
  await expect(lista.getByText('Esportes', { exact: true })).toBeVisible()
  await expect(lista.getByRole('button', { name: 'Esporte Total' })).toBeFocused()
})
