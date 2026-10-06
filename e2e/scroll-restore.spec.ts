import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Back used to drop you at the top of the list, so finding where you were meant scrolling again.
test('going back restores the list scroll position', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Filmes' }).click()
  await expect(page.getByRole('heading', { name: 'Filmes', level: 1 })).toBeVisible()

  const main = page.locator('#main-content')
  // Categories stream in one at a time, so scrolling before the page is tall enough silently clamps to 0
  // — under a loaded machine that happened often enough to make this test flaky.
  await expect.poll(() => main.evaluate((el) => el.scrollHeight - el.clientHeight), { timeout: 15000 }).toBeGreaterThan(400)
  await main.evaluate((el) => el.scrollTo(0, 400))
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(300)

  await page.getByText('Risada Garantida').click()
  await expect(page).toHaveURL(/\/movies\/4/)
  // A fresh page still opens at the top.
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBe(0)

  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Filmes', level: 1 })).toBeVisible()
  // Duas esperas distintas de proposito: primeiro a pagina voltar a ter altura (carregamento do
  // catalogo, que sob carga leva segundos e nao e o que se testa aqui), e so entao a posicao restaurada.
  // Juntar as duas numa assercao so fazia o teste falhar por lentidao do mock, nao por regressao.
  await expect.poll(() => main.evaluate((el) => el.scrollHeight - el.clientHeight), { timeout: 20000 }).toBeGreaterThan(400)
  await expect.poll(() => main.evaluate((el) => el.scrollTop), { timeout: 10000 }).toBeGreaterThan(300)
})
