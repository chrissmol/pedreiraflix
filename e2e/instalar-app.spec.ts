import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// "Instalar o app" no menu da conta (Edge/Chrome no Windows, Chrome no Android): so aparece quando o navegador
// avisa que da para instalar (beforeinstallprompt), e o clique abre o instalador do navegador.
test('menu da conta oferece "Instalar o app" quando o navegador permite', async ({ page }) => {
  await seedSession(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Conta', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Instalar o app' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> }
    e.prompt = async () => void ((window as unknown as { __instalou: boolean }).__instalou = true)
    e.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(e)
  })
  await page.getByRole('button', { name: 'Conta', exact: true }).click()
  await page.getByRole('button', { name: 'Instalar o app' }).click()
  expect(await page.evaluate(() => (window as unknown as { __instalou?: boolean }).__instalou)).toBe(true)
  await page.getByRole('button', { name: 'Conta', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Instalar o app' })).toHaveCount(0)
})
