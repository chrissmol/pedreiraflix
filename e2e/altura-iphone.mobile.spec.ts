import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// iPhone com o app na tela de inicio: `innerHeight` vem menor que a tela (sem a barra de status), o que
// deixava faixa preta embaixo e o menu alto. Instalado, a altura do app tem que ser a da tela inteira.
test('PWA instalado no iPhone usa a altura da tela inteira, nao innerHeight', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true })
    Object.defineProperty(screen, 'height', { value: 932 })
    Object.defineProperty(screen, 'width', { value: 430 })
  })
  await seedSession(page)
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--app-h'))).toBe('932px')
  // O body tambem: ele nao rola e corta o que passar da altura dele (era o que ainda deixava a faixa preta).
  await expect.poll(() => page.evaluate(() => [document.body.clientHeight, document.getElementById('root')!.clientHeight])).toEqual([932, 932])
  const menu = await page.getByRole('link', { name: 'Início' }).last().boundingBox()
  expect(menu!.y + menu!.height).toBeGreaterThan(932 - 120)
})

test('no navegador comum continua medindo innerHeight', async ({ page }) => {
  await seedSession(page)
  await page.goto('/')
  const inner = await page.evaluate(() => `${innerHeight}px`)
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--app-h'))).toBe(inner)
})
