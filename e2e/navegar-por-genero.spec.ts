import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Chris (5/11/2026): categorias do provedor ("Filme Cinema Plus") atrapalham; navegar por gênero.
test('filmes: a lista não traz gênero, só tmdb_id; o gênero vem do TMDB e as fileiras são gêneros', async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=get_vod_streams(&|$)/, async (route) => {
    const lista = await (await route.fetch()).json()
    await route.fulfill({ json: lista.map((m: { stream_id: number }) => ({ ...m, genre: undefined, tmdb_id: String(m.stream_id) })) })
  })
  // Gênero 35 (Comédia): filmes 4 e 5; gênero 28 (Ação): 1 e 2. Os outros gêneros voltam vazios.
  await page.route('**/api/generos?*', (route) => {
    const g = new URL(route.request().url()).searchParams.get('genre')
    return route.fulfill({ json: { ids: g === '35' ? [4, 5] : g === '28' ? [1, 2] : [] } })
  })
  await login(page)
  await page.goto('/movies')
  await expect(page.getByRole('heading', { name: 'Comédia' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ação' }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: /Filmes/, level: 2 })).toHaveCount(0)
})

test('séries: o gênero vem na lista e as fileiras são gêneros', async ({ page }) => {
  await login(page)
  await page.goto('/series')
  await expect(page.getByRole('heading', { name: 'Drama', level: 2 }).first()).toBeVisible()
})

// Chris (5/11/2026): fileira "Novidades" (últimas adições do provedor) no Início, em Filmes e em Séries.
test('Novidades: primeira fileira em Filmes e Séries, com o mais recente primeiro', async ({ page }) => {
  await login(page)
  for (const rota of ['/movies', '/series']) {
    await page.goto(rota)
    await expect(page.getByRole('heading', { name: 'Novidades', level: 2 })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Novidades')
  }
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Novidades em filmes' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Novidades em séries' })).toBeVisible()
})

// Chris (5/11/2026): dividir também por streaming. O TMDB diz onde cada título passa (por tmdb_id).
test('streaming: fileira e atalho da Netflix em Filmes e Séries, e o genero continua', async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=get_(vod|series)(_streams)?(&|$)/, async (route) => {
    const lista = await (await route.fetch()).json()
    await route.fulfill({ json: lista.map((m: { stream_id?: number; series_id?: number }) => ({ ...m, tmdb: String(m.stream_id ?? m.series_id), tmdb_id: String(m.stream_id ?? m.series_id) })) })
  })
  await page.route('**/api/streaming?*', (route) => {
    const p = new URL(route.request().url()).searchParams.get('provider')
    return route.fulfill({ json: { ids: p === '8' ? [1, 2, 50] : [] } })
  })
  await login(page)
  for (const rota of ['/movies', '/series']) {
    await page.goto(rota)
    await expect(page.getByRole('heading', { name: 'Netflix', level: 2 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Novidades', level: 2 })).toBeVisible()
    await page.getByRole('navigation', { name: 'Streaming' }).getByRole('button', { name: 'Netflix' }).click()
    await expect(page).toHaveURL(/category=s%3Anetflix/)
    await expect(page.getByRole('heading', { name: 'Novidades', level: 2 })).toHaveCount(0)
    // Dentro do streaming: fileiras por genero (so dos titulos dele), nao uma grade unica.
    const fileiras = page.getByRole('heading', { level: 2 })
    await expect(fileiras.first()).toBeVisible()
    expect(await fileiras.count()).toBeGreaterThan(0)
    await expect(page.getByRole('heading', { name: 'Netflix', level: 2 })).toHaveCount(0)
    // Escolher um genero (filtro) mostra a grade filtrada dentro do streaming.
    const nome = (await fileiras.first().innerText()).trim()
    await page.getByRole('button', { name: /Filtros/ }).click()
    await page.getByRole('button', { name: nome, exact: true }).click()
    await expect(page).toHaveURL(/category=s%3Anetflix&genre=/)
    await expect(page.getByRole('heading', { name: nome, level: 2 })).toHaveCount(0)
  }
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Netflix', level: 2 }).first()).toBeVisible()
})

// TV: setas + OK dentro das fileiras por genero de um streaming.
test('streaming: setas descem entre fileiras de genero e OK abre o titulo', async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=get_vod_streams(&|$)/, async (route) => {
    const lista = await (await route.fetch()).json()
    await route.fulfill({ json: lista.map((m: { stream_id: number }) => ({ ...m, tmdb_id: String(m.stream_id) })) })
  })
  await page.route('**/api/streaming?*', (r) => r.fulfill({ json: { ids: new URL(r.request().url()).searchParams.get('provider') === '8' ? [1, 2, 3, 4, 5, 6, 7, 8] : [] } }))
  await login(page)
  await page.goto('/movies?category=s%3Anetflix')
  await expect(page.getByRole('heading', { name: 'Aventura', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Filme Explosivo Filme' }).first().focus()
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-spatial') !== null)).toBe(true)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/movies\/\d+/)
})
