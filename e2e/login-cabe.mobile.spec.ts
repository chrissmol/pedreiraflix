import { expect, test } from '@playwright/test'

// Login no celular (APK no Motorola, 08/10): o body do app nao rola, entao o login tem que caber na tela e,
// numa tela muito baixa, rolar sozinho — o "Entrar" nunca pode ficar inalcancavel.
test('login cabe numa tela de celular comum sem rolar', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 780 })
  await page.goto('/login')
  const entrar = page.getByRole('button', { name: 'Entrar', exact: true })
  const caixa = (await entrar.boundingBox())!
  expect(caixa.y + caixa.height).toBeLessThanOrEqual(780)
})

test('em tela muito baixa o login rola ate o Entrar', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 560 })
  await page.goto('/login')
  const entrar = page.getByRole('button', { name: 'Entrar', exact: true })
  // Rolagem de usuario (roda/gesto), nao scrollIntoView: esse rola ate elemento com overflow hidden e nao prova nada.
  await page.mouse.move(180, 300)
  await page.mouse.wheel(0, 2000)
  await expect(entrar).toBeInViewport()
})

test('login cabe num notebook 1280x800 sem rolar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/login')
  const caixa = (await page.getByRole('button', { name: 'Entrar', exact: true }).boundingBox())!
  expect(caixa.y + caixa.height).toBeLessThanOrEqual(800)
})
