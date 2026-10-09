import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Achados do /estressar-apk (08/10) no celular.
test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('o X de "continuar assistindo" tem area de toque de 44px', async ({ page }) => {
  await page.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await page.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 2, null, { timeout: 15000 })
  await page.goto('/')
  const x = (await page.getByRole('button', { name: 'Remover de continuar assistindo' }).first().boundingBox())!
  expect(Math.min(x.width, x.height)).toBeGreaterThanOrEqual(44)
})

test('a barra de progresso do player tem 32px para o dedo', async ({ page }) => {
  await page.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  const barra = page.getByRole('slider', { name: 'Progresso' })
  await page.mouse.move(200, 300)
  await expect(barra).toBeVisible()
  expect((await barra.boundingBox())!.height).toBeGreaterThanOrEqual(32)
})

test('pagina da serie: Assistir e Minha lista na mesma linha', async ({ page }) => {
  await page.goto('/series/50')
  const assistir = (await page.getByRole('button', { name: /Assistir T1:E1/ }).boundingBox())!
  const lista = (await page.getByRole('button', { name: /Minha lista|Na lista/ }).boundingBox())!
  expect(Math.abs(assistir.y - lista.y)).toBeLessThan(4)
})

test('pagina do filme no celular: so um botao de download (o de ver offline)', async ({ page }) => {
  await page.goto('/movies/1')
  await expect(page.getByRole('button', { name: 'Baixar para ver offline' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Baixar arquivo' })).toBeHidden()
})
