import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

// Progresso e por episodio: comecar o E1, sair e abrir o E3 pela lista deixava a serie duas vezes na fileira.
test('serie aparece uma vez so em "Continuar assistindo", no episodio mais recente', async ({ page }) => {
  for (const ep of ['T1E1 - Episódio 1', 'T1E3 - Episódio 3']) {
    await page.goto('/series/50')
    await page.getByText(ep).click()
    await expect(page).toHaveURL(/\/watch\/series\//)
    await expect.poll(() => page.evaluate(() => localStorage.getItem('iptv-library') ?? '')).toContain(ep)
  }
  await page.goto('/')
  const row = page.locator('section', { has: page.getByRole('heading', { name: 'Continuar assistindo' }) })
  await expect(row.getByRole('button', { name: /T1E3 - Episódio 3/ })).toBeVisible()
  await expect(row.getByRole('button', { name: /Série Dramática/ })).toHaveCount(1)
})
