import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Download no navegador/app do Windows (09/10): o do Windows do amigo do Christian gravava como filme a pagina de erro
// do provedor ("0 MB" que dava erro ao tocar) e o dele nem completava. Agora: o filme vem em pedacos (Range) com
// nova tentativa, uma pagina no lugar do video e recusada com o motivo escrito, e nada de lixo no IndexedDB.
const baixar = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Baixar para ver offline', exact: true })
const registros = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('pedreiraflix-offline')
        req.onsuccess = () => {
          const q = req.result.transaction('downloads').objectStore('downloads').count()
          q.onsuccess = () => resolve(q.result)
        }
        req.onerror = () => resolve(-1)
      }),
  )

test('pagina de erro no lugar do video nao vira download', async ({ page }) => {
  await page.route(/\/api\/stream\?/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Attention Required! | Cloudflare</body></html>' }),
  )
  await login(page)
  await page.goto('/movies/1')
  await baixar(page).click()
  await expect(page.getByRole('alert').filter({ hasText: 'página em vez do vídeo' })).toBeVisible({ timeout: 15000 })
  expect(await registros(page)).toBe(0)
})

test('recusa do provedor mostra o codigo HTTP', async ({ page }) => {
  await page.route(/\/api\/stream\?/, (route) => route.fulfill({ status: 403, contentType: 'text/plain', body: 'forbidden' }))
  await login(page)
  await page.goto('/movies/1')
  await baixar(page).click()
  await expect(page.getByRole('alert').filter({ hasText: 'HTTP 403' })).toBeVisible({ timeout: 15000 })
  expect(await registros(page)).toBe(0)
})

test('falha passageira do provedor em um pedaco: tenta de novo e completa', async ({ page }) => {
  await page.addInitScript(() => ((window as unknown as { __partBytes: number }).__partBytes = 64 * 1024))
  let pedidos = 0
  await page.route(/\/api\/stream\?/, (route) => (++pedidos === 3 ? route.fulfill({ status: 502, body: 'bad gateway' }) : route.continue()))
  await login(page)
  await page.goto('/movies/1')
  await baixar(page).click()
  await expect(page.getByText('Baixado')).toBeVisible({ timeout: 30000 })
  expect(pedidos).toBeGreaterThan(5) // varios pedacos + a nova tentativa
})

test('servidor que ignora o Range (manda o arquivo todo) tambem baixa e toca', async ({ page }) => {
  await page.route(/\/api\/stream\?/, async (route) => {
    const res = await route.fetch({ headers: { ...route.request().headers(), range: '' } })
    await route.fulfill({ status: 200, headers: { 'content-type': 'video/mp4' }, body: await res.body() })
  })
  await login(page)
  await page.goto('/movies/1')
  await baixar(page).click()
  await expect(page.getByText('Baixado')).toBeVisible({ timeout: 30000 })
  await page.goto('/downloads')
  await page.getByRole('button', { name: 'Filme Explosivo Filme' }).click()
  await page.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 1, null, { timeout: 15000 })
})
