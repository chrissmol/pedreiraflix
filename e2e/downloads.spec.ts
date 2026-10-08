import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('download a movie, watch it fully offline, then delete it', async ({ page }) => {
  await login(page)
  await page.goto('/movies/1')
  await expect(page.getByRole('heading', { name: 'Filme Explosivo' })).toBeVisible()

  const downloadButton = page.getByRole('button', { name: 'Baixar para ver offline' })
  await expect(downloadButton).toBeVisible()
  await downloadButton.click()

  // "Baixado" (a <span>, not a button, once done) confirms the whole fetch-and-store-in-IndexedDB flow finished.
  await expect(page.getByText('Baixado')).toBeVisible({ timeout: 15000 })

  await page.goto('/downloads')
  await expect(page.getByRole('heading', { name: 'Downloads' })).toBeVisible()
  const card = page.getByRole('button', { name: 'Filme Explosivo Filme' })
  await expect(card).toBeVisible()
  await expect(page.getByText(/MB|GB/).first()).toBeVisible()

  // Blocks every API/stream call specifically (not the app's own JS chunks — this dev server has no
  // service worker, unlike production, so a hard `context.setOffline(true)` here would also fail to
  // fetch the WatchPage code-split chunk on its first-ever visit, which isn't the claim being tested).
  // This is the precise claim: playing a download makes zero calls to the streaming API/proxy.
  const apiCalls: string[] = []
  await page.route('**/api/**', (route) => {
    apiCalls.push(route.request().url())
    route.abort()
  })
  await card.click()
  await expect(page).toHaveURL(/\/watch\/offline\//)
  await expect(page.getByText(/Baixado.*offline/)).toBeVisible()
  const video = page.locator('video')
  await expect(video).toBeVisible()
  await page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement | null
    return !!v && v.currentTime > 1
  }, { timeout: 15000 })
  expect(apiCalls).toEqual([])
  await page.unroute('**/api/**')

  // Delete it. The button only shows on hover (`group-hover:flex`), so hover the card first like a real user would.
  await page.goto('/downloads')
  await page.getByRole('button', { name: 'Filme Explosivo Filme' }).hover()
  await page.getByRole('button', { name: /Excluir download de/ }).click()
  await page.getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByText('Nada baixado neste perfil ainda.')).toBeVisible()
  // Excluir tambem apaga as partes do video (senao os GB ficariam presos no aparelho).
  const partes = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('pedreiraflix-offline')
        req.onsuccess = () => {
          const n = req.result.transaction('parts').objectStore('parts').count()
          n.onsuccess = () => resolve(n.result)
        }
      }),
  )
  expect(partes).toBe(0)

  await page.goto('/movies/1')
  await expect(page.getByRole('button', { name: 'Baixar para ver offline' })).toBeVisible()
})

test('downloads are scoped per profile', async ({ page }) => {
  await login(page)
  await page.goto('/movies/1')
  await page.getByRole('button', { name: 'Baixar para ver offline' }).click()
  await expect(page.getByText('Baixado')).toBeVisible({ timeout: 15000 })

  // A second profile shouldn't see the first profile's download.
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Gerenciar perfis' }).click()
  await page.getByRole('button', { name: 'Adicionar perfil' }).click()
  await page.getByPlaceholder('Nome do perfil').fill('Outro')
  await page.getByRole('button', { name: 'Criar' }).click()
  await page.getByRole('button', { name: 'Entrar como Outro' }).click()

  await page.goto('/downloads')
  await expect(page.getByText('Nada baixado neste perfil ainda.')).toBeVisible()
})
