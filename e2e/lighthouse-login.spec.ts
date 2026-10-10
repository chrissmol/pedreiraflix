import { expect, test } from '@playwright/test'

// Lighthouse na producao (09/10): login sem landmark <main>, sem meta description e /robots.txt devolvendo a pagina do app.
test('login tem landmark main, a pagina tem descricao e /robots.txt e um texto de verdade', async ({ page, request }) => {
  await page.goto('/login')
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /IPTV/)
  const robots = await request.get('/robots.txt')
  expect(robots.headers()['content-type']).toContain('text/plain')
})
