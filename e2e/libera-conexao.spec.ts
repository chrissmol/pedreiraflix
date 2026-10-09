import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Sair do player tem que soltar o video: um <video> que continua baixando em segundo plano segura uma conexao no
// provedor, e cada uma conta no limite de telas dele (HTTP 403 "sua conta ja esta tocando em outro aparelho" sem
// ninguem assistindo — app do Windows do Christian, 09/10).
test('sair do player solta o video (nao deixa conexao aberta no provedor)', async ({ page }) => {
  await seedSession(page)
  await page.goto('/movies/1')
  await page.getByRole('button', { name: 'Assistir' }).click()
  await page.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 1, null, { timeout: 15000 })
  await page.evaluate(() => ((window as unknown as { __video: HTMLVideoElement }).__video = document.querySelector('video')!))

  await page.getByRole('button', { name: 'Voltar', exact: true }).click()
  await expect(page).toHaveURL(/\/movies\/1$/)
  const solto = await page.evaluate(() => {
    const v = (window as unknown as { __video: HTMLVideoElement }).__video
    return { src: v.getAttribute('src'), rede: v.networkState, noDom: document.contains(v) }
  })
  expect(solto.noDom).toBe(false)
  expect(solto.src).toBeNull()
  expect(solto.rede).toBe(0) // NETWORK_EMPTY: nada mais sendo baixado
})
