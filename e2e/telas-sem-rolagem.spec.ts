import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

// Telas curtas cabem na tela e ficam fixas: nenhuma rola so por causa de min-h-screen dentro do <main> (que ja tem
// 5rem de padding embaixo no celular). Inicio, filmes, series, ao vivo e diagnostico ficam de fora: sao listas longas de verdade.
const ROTAS = ['/guide', '/search', '/times', '/profiles', '/downloads', '/retrospectiva', '/junto', '/categorias', '/suporte']
const TELAS = [
  { nome: 'celular', width: 412, height: 915 },
  { nome: 'computador', width: 1280, height: 720 },
]

for (const t of TELAS) {
  test(`telas curtas nao rolam em ${t.nome}`, async ({ page }) => {
    await seedSession(page)
    await page.setViewportSize({ width: t.width, height: t.height })
    const rolam: string[] = []
    for (const rota of ROTAS) {
      await page.goto(rota)
      await expect(page.locator('main h1, main h2').first()).toBeVisible()
      await page.waitForTimeout(500)
      const sobra = await page.evaluate(() => { const m = document.querySelector('main')!; return m.scrollHeight - m.clientHeight })
      if (sobra > 1) rolam.push(`${rota} (+${sobra}px)`)
    }
    expect(rolam).toEqual([])
  })
}
