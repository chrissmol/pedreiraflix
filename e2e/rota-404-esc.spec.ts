import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

const TELAS = {
  computador: {},
  celular: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
  tv: {
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  },
}

for (const [nome, tela] of Object.entries(TELAS)) {
  test.describe(nome, () => {
    test.use(tela)
    test(`${nome}: rota desconhecida mostra "Página não encontrada" e volta ao Início`, async ({ page }) => {
      await seedSession(page)
      await page.goto('/nao-existe')
      await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
      const voltar = page.getByRole('link', { name: 'Voltar ao Início' })
      if (nome === 'tv') {
        await voltar.focus()
        await page.keyboard.press('Enter')
      } else await voltar.click()
      await expect(page).toHaveURL(/\/$/)
    })
  })
}

test.describe('Esc na busca', () => {
  test.use(TELAS.celular)
  test('Esc limpa o texto e, com o campo vazio, volta da busca', async ({ page }) => {
    await seedSession(page)
    await page.goto('/movies')
    await page.goto('/search')
    const campo = page.getByRole('searchbox', { name: 'Buscar no catálogo' })
    await campo.fill('filme')
    await page.keyboard.press('Escape')
    await expect(campo).toHaveValue('')
    await page.keyboard.press('Escape')
    await expect(page).not.toHaveURL(/\/search/)
  })
})
