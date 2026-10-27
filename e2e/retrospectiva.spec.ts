import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

const mes = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Tempo assistido gravado direto no perfil ativo, neste mes. */
async function seed(page: Page, items: Record<string, unknown>) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Conta', exact: true })).toBeVisible()
  await page.evaluate(
    ({ items, mes }) => {
      const { byAccount } = JSON.parse(localStorage.getItem('iptv-profiles')!).state
      const id = (Object.values(byAccount)[0] as { activeId: string }).activeId
      localStorage.setItem('iptv-retrospectiva', JSON.stringify({ state: { months: { [`${id}:${mes}`]: items } }, version: 1 }))
    },
    { items, mes: mes() },
  )
}

test('retrospectiva: total do mes, serie mais maratonada, genero e os mais assistidos', async ({ page }) => {
  await seed(page, {
    'series-50': { kind: 'series', id: 50, name: 'Série Dramática', image: null, seconds: 3 * 3600 + 20 * 60 },
    'movie-4': { kind: 'movie', id: 4, name: 'Risada Garantida', image: null, seconds: 5400 },
    'movie-5': { kind: 'movie', id: 5, name: 'Amor e Confusão', image: null, seconds: 4000 },
    'live-101': { kind: 'live', id: 101, name: 'Canal Notícias 24h', image: null, seconds: 600 },
  })
  await page.getByRole('button', { name: 'Conta', exact: true }).click()
  await page.getByRole('button', { name: 'Sua retrospectiva' }).click()
  await expect(page).toHaveURL(/\/retrospectiva/)
  await expect(page.getByTestId('retro-total')).toHaveText('6 h 6 min')
  await expect(page.getByText('Série mais maratonada').locator('..')).toContainText('Série Dramática')
  await expect(page.getByText('Filme que mais te prendeu').locator('..')).toContainText('Risada Garantida')
  // Comedia: 2 filmes (1h30 + 1h06) passam o Drama da serie? Nao: 3h20 de Drama > 2h36 de Comedia.
  await expect(page.getByTestId('retro-genero')).toHaveText('Drama')
  const lista = page.locator('ol li')
  await expect(lista).toHaveCount(4)
  await expect(lista.first()).toContainText('Série Dramática')
  await lista.first().getByRole('button').click()
  await expect(page).toHaveURL(/\/series\/50/)
})

test('retrospectiva: mes sem nada mostra o convite', async ({ page }) => {
  await page.goto('/retrospectiva')
  await expect(page.getByText(/Nada assistido em/)).toBeVisible()
})

test('o tempo conta so enquanto o video toca', async ({ page }) => {
  await page.clock.install()
  await page.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  const video = page.locator('video')
  await expect(video).toBeAttached()
  // Simula "tocando" sem depender de codec: o Chromium da nuvem nao toca o mp4 do mock.
  await video.evaluate((v: HTMLVideoElement) => {
    Object.defineProperty(v, 'paused', { get: () => false, configurable: true })
    Object.defineProperty(v, 'readyState', { get: () => 4, configurable: true })
  })
  await page.clock.runFor(31_000)
  await video.evaluate((v: HTMLVideoElement) => Object.defineProperty(v, 'paused', { get: () => true, configurable: true }))
  await page.clock.runFor(60_000)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('iptv-retrospectiva') || '{}'))
  const month = Object.values(saved.state.months)[0] as Record<string, { seconds: number; name: string }>
  expect(month['movie-1']).toMatchObject({ seconds: 30, name: 'Filme Explosivo' })
})

test.describe('TV', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })
  test('TV: retrospectiva com setas e OK abre o mais assistido', async ({ page }) => {
    await seed(page, { 'movie-4': { kind: 'movie', id: 4, name: 'Risada Garantida', image: null, seconds: 5400 } })
    await page.goto('/retrospectiva')
    await expect(page.getByTestId('retro-total')).toHaveText('1 h 30 min')
    for (let i = 0; i < 10; i++) {
      const inList = await page.evaluate(() => !!document.activeElement?.closest('ol'))
      if (inList) break
      await page.keyboard.press('ArrowDown')
    }
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/movies\/4/)
  })
})
