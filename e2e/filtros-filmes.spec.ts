import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Pedido do Suporte (21/10): poder somar filtros nos filmes, ex. ano e genero (a categoria faz as vezes de genero).
test('filmes: categoria e ano juntos', async ({ page }) => {
  await login(page)
  await page.goto('/movies')
  await page.getByRole('button', { name: 'Filtros' }).click()
  await page.getByRole('button', { name: 'Ano' }).click()
  await page.getByRole('option', { name: '2019' }).click()
  await page.getByRole('button', { name: 'Categoria' }).click()
  await page.getByRole('option', { name: 'Ação' }).click()
  await expect(page.getByRole('button', { name: /Corrida Final/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Filme Explosivo/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Amor e Confusão/ })).toHaveCount(0)
})
