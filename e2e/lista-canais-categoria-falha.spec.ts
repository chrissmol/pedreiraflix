import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Provedor limitando (429) ou instavel numa categoria: o botao da lista de canais (e o zapping) tem que aparecer
// com as categorias que carregaram. Antes um Promise.all unico escondia tudo se uma so falhasse.
test('ao vivo: uma categoria falhando nao esconde o botao da lista de canais', async ({ page }) => {
  await seedSession(page)
  await page.route(/action=get_live_streams.*category_id=2(&|$)/, (route) => route.fulfill({ status: 429, body: 'slow down' }))
  await page.goto('/watch/live/101?name=Canal')
  await page.getByRole('button', { name: 'Lista de canais' }).waitFor()
  await page.mouse.move(400, 300)
  await page.getByRole('button', { name: 'Lista de canais' }).click()
  const lista = page.getByRole('dialog', { name: 'Lista de canais' })
  await expect(lista).toBeVisible()
  await expect(lista.getByRole('button', { name: 'Canal Economia' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(lista.getByText('Esportes', { exact: true })).toHaveCount(0)
})
