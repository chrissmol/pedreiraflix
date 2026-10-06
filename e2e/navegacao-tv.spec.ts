import { expect, test } from '@playwright/test'
import { login } from './helpers'

// O gesto de um controle remoto: descer uma fileira sem usar Tab dezenas de vezes. Serve tambem para
// quem navega so de teclado no desktop.
test('setas verticais movem o foco entre fileiras do catalogo', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Filmes' }).click()
  await expect(page.getByRole('heading', { name: 'Filmes', level: 1 })).toBeVisible()

  const primeiro = page.getByRole('button', { name: 'Filme Explosivo Filme' })
  await primeiro.focus()
  await page.keyboard.press('ArrowDown')

  await expect(primeiro).not.toBeFocused()
  const focado = await page.evaluate(() => document.activeElement?.getAttribute('data-spatial') !== null)
  expect(focado).toBe(true)
})

test('com o foco fora do catalogo as setas continuam rolando a pagina', async ({ page }) => {
  await login(page)
  await page.goto('/movies')
  await expect(page.getByRole('heading', { name: 'Filmes', level: 1 })).toBeVisible()
  const main = page.locator('#main-content')
  await expect.poll(() => main.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(200)

  // Nada focado: a seta nao pode ser sequestrada, senao quebra a rolagem por teclado no desktop.
  await main.evaluate((el) => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    el.focus()
  })
  const antes = await main.evaluate((el) => el.scrollTop)
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(antes)
})
