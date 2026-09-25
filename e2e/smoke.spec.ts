import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('browses movies, series and live, and plays a video end to end', async ({ page }) => {
  await login(page)

  await page.getByRole('link', { name: 'Filmes' }).click()
  // Confirms the Filmes page has actually mounted before matching on title text — Home's own "Ação" row
  // (plus, now, its "Adicionados recentemente"/"Recomendado pra você" rows) shows the same movie, and the
  // app's single top-level Suspense boundary can briefly render both trees mid-navigation.
  await expect(page.getByRole('heading', { name: 'Filmes', level: 1 })).toBeVisible()
  await expect(page.getByText('Filme Explosivo')).toBeVisible()
  await page.getByText('Filme Explosivo').click()
  await expect(page.getByRole('heading', { name: 'Filme Explosivo' })).toBeVisible()
  await page.getByRole('button', { name: 'Assistir' }).click()
  await expect(page).toHaveURL(/\/watch\/movie\//)
  const video = page.locator('video')
  await expect(video).toBeVisible()
  await page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement | null
    return !!v && v.currentTime > 1
  }, { timeout: 15000 })

  await page.goBack()
  await page.goBack()
  await page.getByRole('link', { name: 'Séries' }).click()
  await expect(page.getByRole('heading', { name: 'Séries', level: 1 })).toBeVisible()
  await expect(page.getByText('Série Dramática')).toBeVisible()
  await page.getByText('Série Dramática').click()
  await expect(page.getByText('T1E1 - Episódio 1')).toBeVisible()

  await page.getByRole('link', { name: 'Canais' }).click()
  await expect(page.getByText('Canal Notícias 24h')).toBeVisible()
  await page.getByText('Canal Notícias 24h').click()
  await expect(page).toHaveURL(/\/watch\/live\//)
  await expect(page.locator('video')).toBeVisible()
  await page.waitForFunction(() => {
    const v = document.querySelector('video') as HTMLVideoElement | null
    return !!v && v.currentTime > 1
  }, { timeout: 15000 })
})
