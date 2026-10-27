import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Filtros num botao so (antes: 3 seletores + fileira de generos quebrando em 2 linhas, print do Christian 27/10).
test('series: generos repetidos viram um so, em portugues, e o filtro fica como pilula', async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=get_series(&|$)/, async (route) => {
    const lista = await (await route.fetch()).json()
    const base = lista.find((x: { category_id: string }) => x.category_id === '20')
    await route.fulfill({
      json: !base ? lista : [
        ...lista,
        { ...base, series_id: 70, name: 'Doc Um', genre: 'Documentary' },
        { ...base, series_id: 71, name: 'Doc Dois', genre: 'Documentário, Kids' },
      ],
    })
  })
  await login(page)
  await page.goto('/series')
  await expect(page.getByRole('button', { name: /Série Dramática/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Todos os gêneros' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Filtros' }).click()
  const painel = page.getByRole('dialog', { name: 'Filtros' })
  await expect(painel.getByRole('button', { name: 'Documentário', exact: true })).toHaveCount(1)
  await expect(painel.getByRole('button', { name: 'Documentary', exact: true })).toHaveCount(0)
  await expect(painel.getByRole('button', { name: 'Kids', exact: true })).toHaveCount(0)

  await painel.getByRole('button', { name: 'Documentário', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /Doc Um/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Doc Dois/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Série Dramática/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Remover filtro Documentário' }).click()
  await expect(page.getByRole('button', { name: /Série Dramática/ }).first()).toBeVisible()
})
