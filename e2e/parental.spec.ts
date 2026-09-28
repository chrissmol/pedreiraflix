import { expect, test } from '@playwright/test'
import { login } from './helpers'

async function markCurrentProfileKids(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Gerenciar perfis' }).click()
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByLabel('Perfil infantil').check()
  await page.getByRole('button', { name: 'Fechar' }).click()
}

test('a kids profile never sees adult categories, in any list or search', async ({ page }) => {
  await login(page)
  await markCurrentProfileKids(page)
  await page.goto('/movies')
  await expect(page.getByText('Filme Adulto')).toHaveCount(0)
  await expect(page.getByText('Filme Explosivo')).toBeVisible()

  await page.goto('/live')
  await expect(page.getByText('Canal Adulto')).toHaveCount(0)

  await page.goto('/search?q=adulto')
  await expect(page.getByText('Filme Adulto')).toHaveCount(0)
  await expect(page.getByText('Canal Adulto')).toHaveCount(0)
})

test('a kids profile is blocked from a direct link into an adult category', async ({ page }) => {
  await login(page)
  await markCurrentProfileKids(page)

  // "Filme Adulto" is stream id 9 in the mock catalog — reached directly, bypassing the filtered list.
  await page.goto('/movies/9')
  await expect(page.getByText('Conteúdo bloqueado para este perfil')).toBeVisible()

  await page.goto('/watch/movie/9')
  await expect(page.getByText('Conteúdo bloqueado para este perfil')).toBeVisible()
  await expect(page.locator('video')).toHaveCount(0)
})

test('a non-kids profile still sees everything (filter is per profile)', async ({ page }) => {
  await login(page)
  await page.goto('/movies')
  await expect(page.getByText('Filme Adulto')).toBeVisible()
})

test('a PIN-protected profile cannot be entered without the correct PIN', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Conta' }).click()
  await page.getByRole('button', { name: 'Gerenciar perfis' }).click()
  await page.getByRole('button', { name: 'Adicionar perfil' }).click()
  await page.getByPlaceholder('Nome do perfil').fill('Pai')
  await page.getByRole('button', { name: 'Criar' }).click()
  await expect(page.getByText('Pai')).toBeVisible()

  // Set a PIN on the newly created (non-active) profile via its own settings panel. Scoped by
  // data-testid rather than the "Pai" text, which disappears once the settings panel replaces it.
  const card = page.getByTestId(/^profile-card-/).last()
  await card.getByRole('button', { name: 'Ajustes' }).click()
  await card.getByPlaceholder('0000').fill('4321')
  await card.getByRole('button', { name: 'Definir' }).click()
  await expect(card.getByText('PIN ativo')).toBeVisible()
  await card.getByRole('button', { name: 'Fechar' }).click()

  // Wrong PIN doesn't switch. Scoped to the dialog: its own aria-label ("PIN do perfil Pai") also
  // matches the loose getByLabel('PIN') substring search, ambiguous with the input inside it.
  await card.getByRole('button', { name: 'Entrar como Pai' }).click()
  const pinDialog = page.getByRole('dialog')
  await pinDialog.getByLabel('PIN', { exact: true }).fill('0000')
  await expect(page.getByText('PIN incorreto')).toBeVisible()
  await expect(page).toHaveURL(/\/profiles$/)

  // Correct PIN switches and lands on Home.
  await pinDialog.getByLabel('PIN', { exact: true }).fill('4321')
  await expect(page).toHaveURL(/\/$/)
})
