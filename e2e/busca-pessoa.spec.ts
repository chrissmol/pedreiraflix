import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

// O TMDB (Worker) devolve os titulos do ator; so aparece o que existe no catalogo.
test('busca por ator mostra os filmes dele que estao no catalogo', async ({ page }) => {
  await page.route('**/api/pessoa?*', (route) =>
    route.fulfill({ json: { name: 'Ator A', directing: false, titles: ['Filme Explosivo', 'Explosive Movie', 'Filme Que Nao Existe Aqui'] } }),
  )
  await page.goto('/search?q=ator%20a')
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Com Ator A' }) })
  await expect(section.getByRole('button', { name: /Filme Explosivo/ })).toBeVisible()
  await expect(section.getByRole('button')).toHaveCount(1)
})

test('diretor ganha o titulo "Dirigidos por"; sem pessoa, nada muda', async ({ page }) => {
  await page.route('**/api/pessoa?*', (route) =>
    new URL(route.request().url()).searchParams.get('q') === 'diretora c'
      ? route.fulfill({ json: { name: 'Diretora C', directing: true, titles: ['Corrida Final'] } })
      : route.fulfill({ status: 204 }),
  )
  await page.goto('/search?q=diretora%20c')
  await expect(page.getByRole('heading', { name: 'Dirigidos por Diretora C' })).toBeVisible()
  await page.goto('/search?q=filme%20explosivo')
  await expect(page.getByRole('button', { name: /Filme Explosivo/ }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: /^(Com|Dirigidos por) / })).toHaveCount(0)
})
