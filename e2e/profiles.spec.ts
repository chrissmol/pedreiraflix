import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('favorites and progress are separate per profile, on the same login', async ({ page }) => {
  await login(page)

  // Favorite a movie on the default profile.
  await page.getByRole('link', { name: 'Filmes' }).click()
  await page.getByRole('button', { name: 'Filme Explosivo Filme' }).click()
  await page.getByRole('button', { name: 'Minha lista' }).click()
  await expect(page.getByRole('button', { name: 'Na lista' })).toBeVisible()

  // Create a second profile and switch to it.
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Gerenciar perfis' }).click()
  await expect(page).toHaveURL(/\/profiles$/)
  await page.getByRole('button', { name: 'Adicionar perfil' }).click()
  await page.getByPlaceholder('Nome do perfil').fill('Criança')
  await page.getByRole('button', { name: 'Criar' }).click()
  await expect(page.getByText('Criança')).toBeVisible()
  await page.getByRole('button', { name: 'Entrar como Criança' }).click()
  await expect(page).toHaveURL(/\/$/)

  // The new profile sees no favorite for that movie.
  await page.getByRole('link', { name: 'Filmes' }).click()
  await page.getByRole('button', { name: 'Filme Explosivo Filme' }).click()
  await expect(page.getByRole('button', { name: 'Minha lista' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Na lista' })).toHaveCount(0)

  // Favoriting here doesn't affect the first profile.
  await page.getByRole('button', { name: 'Minha lista' }).click()
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: /Entrar como/ }).click() // back to the default profile
  await page.getByRole('link', { name: 'Filmes' }).click()
  await page.getByRole('button', { name: 'Filme Explosivo Filme' }).click()
  await expect(page.getByRole('button', { name: 'Na lista' })).toBeVisible()
})

test('profiles survive logout/login (tied to the account, not the session)', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Gerenciar perfis' }).click()
  await page.getByRole('button', { name: 'Adicionar perfil' }).click()
  await page.getByPlaceholder('Nome do perfil').fill('Segundo')
  await page.getByRole('button', { name: 'Criar' }).click()
  await expect(page.getByText('Segundo')).toBeVisible()

  await page.goto('/')
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/login$/)

  await page.getByRole('button', { name: /Entrar/ }).first().click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Gerenciar perfis' }).click()
  await expect(page.getByText('Segundo')).toBeVisible()
})

test('cannot delete the last remaining profile', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Gerenciar perfis' }).click()
  await expect(page.locator('.grid > div').filter({ hasText: /./ })).toHaveCount(1)
  // No delete option should render for the only profile (hover reveal is gated behind profiles.length > 1).
  await expect(page.getByRole('button', { name: 'Excluir' })).toHaveCount(0)
})

test('pre-profiles favorites/progress/watched data is preserved after the profiles upgrade', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded-legacy')) return
    sessionStorage.setItem('seeded-legacy', '1')
    // Old, unscoped shape (version 0): favorites as a flat array, progress/watched as flat records.
    localStorage.setItem(
      'iptv-library',
      JSON.stringify({
        state: {
          favorites: [{ kind: 'movie', id: 1, name: 'Filme Explosivo', image: null }],
          progress: {
            'movie-1': {
              kind: 'movie', id: '1', name: 'Filme Explosivo', image: null, ext: 'mp4',
              positionSeconds: 300, durationSeconds: 1200, updatedAt: Date.now(),
            },
          },
          watched: { 'series-5011': true },
        },
        version: 0,
      }),
    )
  })
  await login(page)
  await expect(page.getByRole('heading', { name: 'Continuar assistindo' })).toBeVisible()
  await page.getByRole('link', { name: 'Filmes' }).click()
  await page.getByRole('button', { name: 'Filme Explosivo Filme' }).click()
  await expect(page.getByRole('button', { name: 'Na lista' })).toBeVisible()
})
