import { expect, test } from '@playwright/test'
import { login } from './helpers'

// "Baixar temporada" (08/10): baixa os episodios um de cada vez (cada download ocupa uma tela do provedor)
// e, se ja houver episodios baixados, so os que faltam.
test('baixar temporada baixa um episodio por vez e pula os ja baixados', async ({ page }) => {
  let emAndamento = 0
  let maximo = 0
  await page.route(/\/api\/stream\?/, async (route) => {
    maximo = Math.max(maximo, ++emAndamento)
    await new Promise((r) => setTimeout(r, 300))
    await route.continue()
    emAndamento--
  })
  await login(page)
  await page.goto('/series/50')
  await expect(page.getByRole('heading', { name: 'Série Dramática' })).toBeVisible()

  // Um episodio baixado na mao antes: o botao passa a oferecer so os que faltam.
  await page.getByRole('button', { name: 'Baixar para ver offline', exact: true }).first().click()
  await expect(page.getByRole('button', { name: 'Baixar 2 restantes' })).toBeVisible({ timeout: 15000 })

  await page.getByRole('button', { name: 'Baixar 2 restantes' }).click()
  await expect(page.getByRole('status').filter({ hasText: /Baixando \d de 2/ })).toBeVisible()
  await expect(page.getByText('Mantenha o app aberto até terminar.')).toBeVisible()
  await expect(page.getByText('Temporada baixada')).toBeVisible({ timeout: 20000 })
  expect(maximo).toBe(1)

  await page.goto('/downloads')
  await expect(page.getByRole('button', { name: /Excluir download de .*T1E\d/ })).toHaveCount(3)
})

test('parar a temporada termina o episodio atual e nao comeca o proximo', async ({ page }) => {
  await page.route(/\/api\/stream\?/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500))
    await route.continue()
  })
  await login(page)
  await page.goto('/series/50')
  await page.getByRole('button', { name: 'Baixar temporada' }).click()
  await page.getByRole('button', { name: 'Parar' }).click()
  await expect(page.getByRole('button', { name: 'Baixar 2 restantes' })).toBeVisible({ timeout: 15000 })
})
