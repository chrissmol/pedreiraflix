import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

// Mesmo jeito do proximo-episodio.spec.ts: para perto do fim, sem o "ended" trocar de episodio.
async function stopNearEnd(page: Page) {
  await page.locator('video').evaluate(async (v: HTMLVideoElement) => {
    while (!Number.isFinite(v.duration)) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }))
    v.pause()
  })
  await page.waitForTimeout(5500)
  await page.locator('video').evaluate((v: HTMLVideoElement) => (v.currentTime = v.duration - 0.5))
}

/** Grava vistos direto no armazenamento, no perfil ativo (o video do mock nao toca no Chromium sem codecs). */
async function seed(page: Page, watched: string[], seriesDone?: Record<string, unknown>) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Conta', exact: true })).toBeVisible()
  await page.evaluate(
    ({ watched, seriesDone }) => {
      const { byAccount } = JSON.parse(localStorage.getItem('iptv-profiles')!).state
      const account = Object.values(byAccount)[0] as { activeId: string }
      const saved = JSON.parse(localStorage.getItem('iptv-library') ?? '{"state":{},"version":1}')
      saved.state.watched = { ...saved.state.watched, ...Object.fromEntries(watched.map((k) => [`${account.activeId}:${k}`, true])) }
      if (seriesDone) saved.state.seriesDone = Object.fromEntries(Object.entries(seriesDone).map(([k, v]) => [`${account.activeId}:${k}`, v]))
      localStorage.setItem('iptv-library', JSON.stringify(saved))
    },
    { watched, seriesDone },
  )
}

const ALL = ['series-5011', 'series-5012', 'series-5013', 'series-5021', 'series-5022', 'series-5023']

test('filme visto e serie toda vista ganham o ✓ no poster e o selo na pagina', async ({ page }) => {
  await seed(page, ['movie-1', ...ALL])
  await page.goto('/movies')
  await expect(page.getByRole('button', { name: /Filme Explosivo/ }).getByRole('img', { name: 'Assistido' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Assistido' })).toHaveCount(1)
  await page.goto('/movies/1')
  await expect(page.getByText('Assistido', { exact: true })).toBeVisible()

  // O ✓ da serie nasce quando a pagina dela (que ja tem a lista de episodios) confere que todos foram vistos.
  await page.goto('/series/50')
  await expect(page.getByText('Concluída', { exact: true })).toBeVisible()
  await page.goto('/series')
  await expect(page.getByRole('button', { name: /Série Dramática/ }).getByRole('img', { name: 'Série concluída' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Série concluída' })).toHaveCount(1)
})

test('serie concluida que ganhou episodios novos mostra "Novos episódios" e perde o ✓', async ({ page }) => {
  // Concluida quando tinha 5 episodios; agora o provedor lista 6.
  await seed(page, ALL.slice(0, 5), { 50: { episodes: 5, done: true, at: 1 } })
  await page.goto('/series')
  await expect(page.getByRole('img', { name: 'Série concluída' })).toHaveCount(1)
  await page.goto('/series/50')
  await expect(page.getByText('Novos episódios', { exact: true })).toBeVisible()
  await page.goto('/series')
  await expect(page.getByRole('button', { name: /Série Dramática/ })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Série concluída' })).toHaveCount(0)
})

test('acabar o ultimo episodio no player conclui a serie', async ({ page }) => {
  await seed(page, ALL.slice(0, 5))
  await page.goto('/watch/series/5023?ext=mp4&name=x&seriesId=50')
  await stopNearEnd(page)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('iptv-library') ?? '')).toContain('"done":true')
})

test.describe('TV', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })
  test('o ✓ aparece no poster da TV e o OK abre o filme com o selo', async ({ page }) => {
    await seed(page, ['movie-1'])
    await page.goto('/movies')
    const card = page.getByRole('button', { name: /Filme Explosivo/ })
    await expect(card.getByRole('img', { name: 'Assistido' })).toBeVisible()
    await card.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/movies\/1/)
    await expect(page.getByText('Assistido', { exact: true })).toBeVisible()
  })
})
