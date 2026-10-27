import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

// Logo do titulo, classificacao indicativa, sinopse traduzida por IA, "Escolher pelo humor" e "Resumo ate aqui".
// TMDB e IA ficam no Worker; aqui as respostas dele sao simuladas.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

async function mockTmdb(page: Page, extra: Record<string, unknown>) {
  await page.route('**/api/tmdb?*', (route) =>
    route.fulfill({ json: { genres: [], year: null, rating: null, overview: null, imdbRating: null, logo: 'https://image.tmdb.org/t/p/w500/logo.png', ...extra } }),
  )
  await page.route(/\/api\/stream\?url=https%3A%2F%2Fimage\.tmdb\.org/, (route) => route.fulfill({ contentType: 'image/png', body: PNG }))
}

async function seedProgress(page: Page, episodeId: number) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Conta', exact: true })).toBeVisible()
  await page.evaluate((episodeId) => {
    const { byAccount } = JSON.parse(localStorage.getItem('iptv-profiles')!).state
    const account = Object.values(byAccount)[0] as { activeId: string }
    const saved = JSON.parse(localStorage.getItem('iptv-library') ?? '{"state":{},"version":1}')
    saved.state.progress = {
      [`${account.activeId}:series-${episodeId}`]: { kind: 'series', id: String(episodeId), name: 'Ep', image: null, ext: 'mp4', positionSeconds: 60, durationSeconds: 1200, updatedAt: Date.now(), seriesId: 50 },
    }
    localStorage.setItem('iptv-library', JSON.stringify(saved))
  }, episodeId)
}

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('filme: logo no lugar do nome, selo da classificacao e sinopse traduzida pela IA quando falta', async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=get_vod_info/, async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    Object.assign(json.info, { plot: '' })
    await route.fulfill({ response: res, json })
  })
  await mockTmdb(page, { certification: '14' })
  await page.route('**/api/sinopse?*', (route) => route.fulfill({ json: { overview: 'Um filme traduzido pela IA.' } }))
  await page.goto('/movies/1')
  await expect(page.getByRole('heading', { level: 1 }).getByRole('img', { name: 'Filme Explosivo' })).toBeVisible()
  await expect(page.getByTitle('Não recomendado para menores de 14 anos')).toHaveText('14')
  await expect(page.getByText('Um filme traduzido pela IA.')).toBeVisible()
  await expect(page.getByText('Sinopse traduzida por IA')).toBeVisible()
})

test('filme: logo que nao carrega volta para o nome escrito; sinopse do provedor nao chama a IA', async ({ page }) => {
  await page.route('**/api/tmdb?*', (route) => route.fulfill({ json: { genres: [], overview: null, logo: 'https://image.tmdb.org/t/p/w500/quebrado.png' } }))
  await page.route(/\/api\/stream\?url=https%3A%2F%2Fimage\.tmdb\.org/, (route) => route.fulfill({ status: 404 }))
  let sinopse = 0
  await page.route('**/api/sinopse?*', (route) => (sinopse++, route.fulfill({ status: 204 })))
  await page.goto('/movies/1')
  await expect(page.getByRole('heading', { level: 1, name: 'Filme Explosivo' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 }).getByRole('img')).toHaveCount(0)
  expect(sinopse).toBe(0)
})

test('perfil infantil: titulo para maiores de 16 fica bloqueado pela idade', async ({ page }) => {
  await mockTmdb(page, { certification: '16' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Conta', exact: true }).click()
  await page.getByRole('button', { name: 'Gerenciar perfis' }).click()
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByLabel('Perfil infantil').check()
  await page.getByRole('button', { name: 'Fechar' }).click()
  await page.goto('/movies/1')
  await expect(page.getByText('Esse título é para maiores de 16 anos. Troque de perfil para assistir.')).toBeVisible()
})

test('Escolher pelo humor: um toque faz a busca por IA com a frase pronta', async ({ page }) => {
  const pedidos: string[] = []
  await page.route('**/api/sugestoes?*', async (route) => {
    pedidos.push(new URL(route.request().url()).searchParams.get('q') || '')
    await new Promise((r) => setTimeout(r, 2000))
    return route.fulfill({ json: { titles: ['Risada Garantida'] } })
  })
  await page.goto('/search')
  await page.getByRole('button', { name: 'Pra rir' }).click()
  // Enquanto a IA pensa, nada de "Nada encontrado".
  await expect.poll(() => pedidos.length).toBe(1)
  await page.waitForTimeout(800)
  await expect(page.getByText(/Nada encontrado/)).toHaveCount(0)
  const secao = page.locator('section', { has: page.getByRole('heading', { name: 'Combina com a sua busca' }) })
  await expect(secao.getByRole('button', { name: /Risada Garantida/ })).toBeVisible()
  expect(pedidos).toEqual(['comédias leves para dar risada'])
})

test('Resumo ate aqui: pede o resumo dos episodios antes do que vai continuar e fecha no segundo toque', async ({ page }) => {
  await mockTmdb(page, {})
  const pedidos: string[] = []
  await page.route('**/api/resumo?*', (route) => {
    pedidos.push(new URL(route.request().url()).search)
    return route.fulfill({ json: { summary: 'Na primeira temporada, tudo começou.' } })
  })
  await seedProgress(page, 5021) // T2:E1
  await page.goto('/series/50')
  await expect(page.getByRole('button', { name: /Continuar T2:E1/ })).toBeVisible()
  const botao = page.getByRole('button', { name: 'Resumo até aqui' })
  await botao.click()
  await expect(page.getByText('Antes de T2:E1')).toBeVisible()
  await expect(page.getByText('Na primeira temporada, tudo começou.')).toBeVisible()
  expect(pedidos[0]).toContain('season=2&episode=1')
  await botao.click()
  await expect(page.getByText('Na primeira temporada, tudo começou.')).toHaveCount(0)
})

test('Resumo ate aqui: some no primeiro episodio e avisa quando a IA nao responde', async ({ page }) => {
  await mockTmdb(page, {})
  await page.route('**/api/resumo?*', (route) => route.fulfill({ status: 204 }))
  await seedProgress(page, 5011)
  await page.goto('/series/50')
  await expect(page.getByRole('button', { name: /Continuar T1:E1/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resumo até aqui' })).toHaveCount(0)
  await seedProgress(page, 5012)
  await page.goto('/series/50')
  await page.getByRole('button', { name: 'Resumo até aqui' }).click()
  await expect(page.getByText('Não deu para fazer o resumo desta série agora.')).toBeVisible()
})

test.describe('TV (setas e OK)', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })
  const focado = (page: Page) => page.evaluate(() => (document.activeElement?.textContent || '').trim())

  test('TV: humor e resumo chegam pelas setas e abrem com OK', async ({ page }) => {
    await page.route('**/api/sugestoes?*', (route) => route.fulfill({ json: { titles: ['Risada Garantida'] } }))
    await page.goto('/search')
    await expect(page.getByRole('button', { name: 'Pra rir' })).toBeVisible()
    // Do campo de busca, a seta para baixo cai na primeira linha dos botoes de humor; para a esquerda chega no primeiro.
    for (let i = 0; i < 8 && (await focado(page)) !== 'Pra rir'; i++) await page.keyboard.press(i < 1 ? 'ArrowDown' : 'ArrowLeft')
    expect(await focado(page)).toBe('Pra rir')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: /Risada Garantida/ })).toBeVisible()

    await mockTmdb(page, { certification: 'L' })
    await page.route('**/api/resumo?*', (route) => route.fulfill({ json: { summary: 'Resumo na TV.' } }))
    await seedProgress(page, 5012)
    await page.goto('/series/50')
    await expect(page.getByRole('button', { name: 'Resumo até aqui' })).toBeVisible()
    for (let i = 0; i < 8 && (await focado(page)) !== 'Resumo até aqui'; i++) await page.keyboard.press(i < 2 ? 'ArrowDown' : 'ArrowRight')
    expect(await focado(page)).toBe('Resumo até aqui')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Resumo na TV.')).toBeVisible()
    await expect(page.getByTitle('Livre para todos os públicos')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(960)
  })
})
