import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Print do Chris (27/10): no celular o botao "Definir" vazava pela borda do cartao do perfil.
test('celular: ajustes do perfil cabem no cartao (interruptor, PIN e Fechar)', async ({ page }) => {
  await seedSession(page)
  await page.goto('/profiles')
  const card = page.getByTestId(/^profile-card-/).first()
  await card.getByRole('button', { name: 'Ajustes' }).click()

  const box = (await card.boundingBox())!
  for (const el of [card.getByRole('switch', { name: 'Perfil infantil' }), card.getByPlaceholder('0000'), card.getByRole('button', { name: 'Definir PIN' }), card.getByRole('button', { name: 'Fechar' })]) {
    const b = (await el.boundingBox())!
    expect(b.x).toBeGreaterThanOrEqual(box.x)
    expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width)
  }

  await card.getByRole('switch', { name: 'Perfil infantil' }).check()
  await expect(card.getByRole('switch', { name: 'Perfil infantil' })).toBeChecked()
  await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/celular.png` : undefined })
})
