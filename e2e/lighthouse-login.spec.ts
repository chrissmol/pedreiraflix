import { expect, test } from '@playwright/test'

// Lighthouse na producao (09/10): login sem landmark <main>, sem meta description e /robots.txt devolvendo a pagina do app.
test('login tem landmark main, a pagina tem descricao e /robots.txt e um texto de verdade', async ({ page, request }) => {
  await page.goto('/login')
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /IPTV/)
  const robots = await request.get('/robots.txt')
  expect(robots.headers()['content-type']).toContain('text/plain')
})

// iOS mostra tela branca ao abrir o PWA sem apple-touch-startup-image: cada link tem que apontar para um arquivo real.
test('as imagens de abertura do iOS existem', async ({ page, request }) => {
  await page.goto('/login')
  const hrefs = await page.locator('link[rel="apple-touch-startup-image"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')))
  expect(hrefs.length).toBeGreaterThanOrEqual(8)
  for (const href of hrefs) {
    const res = await request.get(href!)
    expect(res.headers()['content-type'], href!).toContain('image/png')
  }
})

// Cada iPhone da lista do Playwright (tamanho de TELA + escala) tem que casar com exatamente uma imagem de
// abertura; modelo novo sem imagem volta a piscar branco. Falha avisa qual modelo ficou de fora.
test('todo iPhone conhecido casa com uma imagem de abertura', async ({ browser, page }) => {
  await page.goto('/login')
  const medias = await page.locator('link[rel="apple-touch-startup-image"]').evaluateAll((els) => els.map((e) => e.getAttribute('media')!))
  const { devices } = await import('@playwright/test')
  const semImagem: string[] = []
  for (const [nome, d] of Object.entries(devices)) {
    if (!/^iPhone/.test(nome) || /landscape/.test(nome)) continue
    const tela = d.screen ?? d.viewport
    const ctx = await browser.newContext({ viewport: d.viewport, screen: tela, deviceScaleFactor: d.deviceScaleFactor })
    const p = await ctx.newPage()
    const casam = await p.evaluate((qs) => qs.filter((q) => matchMedia(q).matches).length, medias)
    if (casam !== 1) semImagem.push(`${nome} (${tela.width}x${tela.height}@${d.deviceScaleFactor}): ${casam}`)
    await ctx.close()
  }
  expect(semImagem).toEqual([])
})
