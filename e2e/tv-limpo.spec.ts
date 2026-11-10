import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Auditoria do modo TV (10/11): o que sobrava do site na tela da TV.
test.use({
  userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
  viewport: { width: 960, height: 540 },
})

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('TV: as paginas comecam no alto da tela, sem o espaco do cabecalho do site', async ({ page }) => {
  for (const [rota, titulo] of [['/movies', 'Filmes'], ['/series', 'Séries'], ['/live', 'Canais ao vivo'], ['/diagnostico', 'Ajustes']]) {
    await page.goto(rota)
    const box = (await page.getByRole('heading', { name: titulo, exact: true, level: 1 }).boundingBox())!
    expect(box.y, rota).toBeLessThan(60) // era 96 a 117 px de 540
  }
})

test('TV: em Canais o titulo fica numa linha e as ferramentas noutra, sem quebrar', async ({ page }) => {
  await page.goto('/live')
  const titulo = (await page.getByRole('heading', { name: 'Canais ao vivo' }).boundingBox())!
  expect(titulo.height).toBeLessThan(50) // uma linha so
  const y = async (el: ReturnType<typeof page.getByRole>) => Math.round((await el.boundingBox())!.y)
  const busca = await y(page.getByPlaceholder('Filtrar canais…'))
  for (const nome of ['Guia', 'Com catch-up', 'Mosaico']) expect(Math.abs((await y(page.getByRole('button', { name: nome }))) - busca), nome).toBeLessThanOrEqual(2)
})

test('TV: sem "Baixar arquivo" no filme e nos episodios, e sem volume no player', async ({ page }) => {
  await page.goto('/movies/1')
  await expect(page.getByRole('button', { name: 'Assistir' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Baixar arquivo' })).toHaveCount(0)
  await page.goto('/series/50')
  await expect(page.getByRole('heading', { name: 'Episódios' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Baixar arquivo original' })).toHaveCount(0)
  await page.goto('/watch/movie/1?ext=mp4&name=Filme')
  await expect(page.getByRole('button', { name: 'Play/Pause' }).first()).toBeAttached()
  await page.keyboard.press('Enter') // mostra os controles
  await expect(page.getByLabel('Progresso')).toBeVisible()
  await expect(page.getByLabel('Volume')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Mudo' })).toBeHidden()
})
