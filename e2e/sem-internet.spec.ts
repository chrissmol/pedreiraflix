import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Faixa "Sem internet": aparece quando a conexao cai, leva para Downloads e some quando a conexao volta.
test('sem internet aparece a faixa com o atalho para os downloads', async ({ page, context }) => {
  await seedSession(page)
  await page.goto('/movies')
  // A tela carregada antes de cair a conexao (o servidor de dev nao tem as telas guardadas do app publicado).
  await expect(page.getByRole('heading', { name: 'Ação' })).toBeVisible()
  await expect(page.getByText('Sem internet')).toHaveCount(0)
  await context.setOffline(true)
  try {
    await expect(page.getByText('Sem internet')).toBeVisible()
    await page.getByRole('button', { name: 'Ver downloads' }).click()
    await expect(page).toHaveURL(/\/downloads$/)
    await expect(page.getByRole('button', { name: 'Ver downloads' })).toHaveCount(0)
  } finally {
    await context.setOffline(false)
  }
  await expect(page.getByText('Sem internet')).toHaveCount(0)
})
