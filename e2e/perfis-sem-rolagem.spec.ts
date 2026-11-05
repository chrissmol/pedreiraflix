import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Gerenciar perfis com poucos perfis cabe na tela: sem barra de rolagem. (Na TV, 540px de altura, rola com as setas de verdade.)
const TELAS = [
  { nome: 'celular', width: 412, height: 915 },
  { nome: 'computador', width: 1280, height: 720 },
]

for (const t of TELAS) {
  test(`perfis nao rola em ${t.nome}`, async ({ page }) => {
    await seedSession(page)
    await page.setViewportSize({ width: t.width, height: t.height })
    await page.goto('/profiles')
    await expect(page.getByRole('heading', { name: 'Quem está assistindo?' })).toBeVisible()
    const sobra = await page.evaluate(() => { const m = document.querySelector('main')!; return m.scrollHeight - m.clientHeight })
    expect(sobra).toBeLessThanOrEqual(0)
  })
}
