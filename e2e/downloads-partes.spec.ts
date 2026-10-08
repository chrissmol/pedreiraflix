import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Reforco dos downloads (08/10): o video e gravado em pedacos enquanto chega (nao inteiro na memoria),
// e falta de espaco vira aviso claro em vez de "falhou".
test('download gravado em varias partes toca inteiro e offline', async ({ page }) => {
  await page.addInitScript(() => ((window as unknown as { __partBytes: number }).__partBytes = 64 * 1024))
  await login(page)
  await page.goto('/movies/1')
  await page.getByRole('button', { name: 'Baixar para ver offline' }).click()
  await expect(page.getByText('Baixado')).toBeVisible({ timeout: 15000 })

  const salvo = await page.evaluate(
    () =>
      new Promise<{ partes: number; temBlob: boolean }>((resolve) => {
        const req = indexedDB.open('pedreiraflix-offline')
        req.onsuccess = () => {
          const tx = req.result.transaction(['downloads', 'parts'])
          const all = tx.objectStore('downloads').getAll()
          const n = tx.objectStore('parts').count()
          tx.oncomplete = () => resolve({ partes: n.result, temBlob: all.result.some((r) => r.blob) })
        }
      }),
  )
  expect(salvo.partes).toBeGreaterThan(3)
  expect(salvo.temBlob).toBe(false)

  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/downloads')
  await page.getByRole('button', { name: 'Filme Explosivo Filme' }).click()
  await page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement | null
    return !!v && v.currentTime > 1
  }, { timeout: 15000 })
})

test('sem espaco no aparelho avisa em vez de baixar', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'estimate', { value: async () => ({ usage: 1000, quota: 1024 }) })
  })
  await login(page)
  await page.goto('/movies/1')
  await page.getByRole('button', { name: 'Baixar para ver offline' }).click()
  await expect(page.getByRole('button', { name: /Sem espaço no aparelho/ })).toBeVisible({ timeout: 15000 })
})
