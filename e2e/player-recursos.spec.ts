import { expect, test } from '@playwright/test'
import { login } from './helpers'

async function openMovie(page: import('@playwright/test').Page) {
  await login(page)
  await page.goto('/watch/movie/1?ext=mp4&name=Filme%20Explosivo')
  await expect(page.locator('video')).toBeVisible()
}

const fitOf = (page: import('@playwright/test').Page) =>
  page.locator('video').evaluate((v) => getComputedStyle(v).objectFit)

test('a proporção da imagem é ajustável e sobrevive a um reload', async ({ page }) => {
  await openMovie(page)
  expect(await fitOf(page)).toBe('contain')

  await page.getByRole('button', { name: 'Ajustes de exibição' }).click()
  await page.getByRole('button', { name: /Preencher/ }).click()
  await expect.poll(() => fitOf(page)).toBe('cover')

  // É preferência do usuário, não estado de uma sessão: tem de continuar valendo no próximo vídeo.
  await page.reload()
  await expect(page.locator('video')).toBeVisible()
  await expect.poll(() => fitOf(page)).toBe('cover')
})

test('o timer de desligar aparece selecionado no botão', async ({ page }) => {
  await openMovie(page)
  const button = page.getByRole('button', { name: 'Ajustes de exibição' })
  await button.click()
  await page.getByRole('button', { name: '15min', exact: true }).click()
  await expect(button).toContainText('15min')
})

test('as setas de volume funcionam fora do ao vivo', async ({ page }) => {
  await openMovie(page)
  const volume = () => page.locator('video').evaluate((v) => (v as HTMLVideoElement).volume)
  await page.locator('video').evaluate((v) => {
    ;(v as HTMLVideoElement).volume = 0.5
  })

  await page.keyboard.press('ArrowDown')
  await expect.poll(volume).toBeCloseTo(0.45, 2)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect.poll(volume).toBeCloseTo(0.55, 2)
})

// Sem teste para a sincronia de legenda: o menu so aparece quando o stream traz faixas de legenda, e o
// painel falso nao serve nenhuma. Cobrir isso exigiria um master HLS com SUBTITLES no mock — trabalho
// desproporcional para o tamanho do recurso. Validado por typecheck/build e revisao do codigo.
