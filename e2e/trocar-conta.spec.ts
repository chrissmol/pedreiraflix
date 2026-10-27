import { expect, test, type Page } from '@playwright/test'
import { login, MOCK, seedSession } from './helpers'

const PLAYLIST_URL = `${MOCK.baseUrl}/playlist.m3u`

async function abrirTrocarConta(page: Page) {
  await page.getByRole('button', { name: 'Conta', exact: true }).click()
  await page.getByRole('button', { name: 'Trocar conta' }).click()
  await expect(page.getByRole('heading', { name: 'Escolha uma conta salva' })).toBeVisible()
}

test('Trocar conta: vai para a outra conta sem sair e volta sem baixar o catalogo de novo', async ({ page }) => {
  const vodCalls: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('action=get_vod_streams')) vodCalls.push(req.url())
  })
  await login(page)
  await page.getByRole('link', { name: 'Filmes' }).click()
  // Ate a pagina nova aparecer a Inicio continua na tela, e ela mostra o mesmo filme em duas fileiras (strict mode).
  await expect(page.getByRole('heading', { name: 'Filmes', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filme Explosivo Filme' })).toBeVisible()
  await expect(page.getByText('Carregando filmes:')).toHaveCount(0)
  const primeiraCarga = vodCalls.length
  expect(primeiraCarga).toBeGreaterThan(0)

  // "Continuar na conta atual" volta para onde estava, ainda logado.
  await abrirTrocarConta(page)
  await page.getByRole('button', { name: 'Continuar na conta atual' }).click()
  await expect(page).toHaveURL(/\/movies$/)

  // Segunda conta (playlist M3U), entrando pelo "Trocar conta".
  await abrirTrocarConta(page)
  await page.getByRole('button', { name: '+ Usar outra conta' }).click()
  await page.getByRole('button', { name: 'Link M3U' }).click()
  await page.getByLabel('Link da playlist M3U').fill(PLAYLIST_URL)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/movies')
  await expect(page.getByText('Filme M3U Teste').first()).toBeVisible()
  await expect(page.getByText('Filme Explosivo')).toHaveCount(0)

  // De volta a primeira: o catalogo dela continua guardado, nada de baixar de novo.
  await abrirTrocarConta(page)
  await page.getByTestId('saved-accounts').getByRole('button', { name: new RegExp(MOCK.username) }).first().click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('link', { name: 'Filmes' }).click()
  // Ate a pagina nova aparecer a Inicio continua na tela, e ela mostra o mesmo filme em duas fileiras (strict mode).
  await expect(page.getByRole('heading', { name: 'Filmes', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filme Explosivo Filme' })).toBeVisible()
  await expect(page.getByText('Filme M3U Teste')).toHaveCount(0)
  expect(vodCalls.length).toBe(primeiraCarga)
})

test.describe('TV', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })

  test('TV: Trocar conta abre com OK e a conta salva entra com OK', async ({ page }) => {
    // Na TV os campos so aceitam texto depois do OK: entra pela sessao e pela conta salva ja gravadas.
    await seedSession(page)
    await page.addInitScript((creds) => {
      const account = { id: `xtream|${creds.baseUrl}|${creds.username}`, lastUsedAt: 1, credentials: { type: 'xtream', ...creds } }
      localStorage.setItem('iptv-accounts', JSON.stringify({ state: { accounts: [account] }, version: 1 }))
    }, MOCK)
    await page.goto('/')
    await page.getByRole('button', { name: 'Conta', exact: true }).focus()
    await page.keyboard.press('Enter')
    const trocar = page.getByRole('button', { name: 'Trocar conta' })
    await expect(trocar).toBeVisible()
    for (let i = 0; i < 20 && !(await trocar.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('ArrowDown')
    await expect(trocar).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Escolha uma conta salva' })).toBeVisible()
    const conta = page.getByTestId('saved-accounts').getByRole('button', { name: new RegExp(MOCK.username) }).first()
    await conta.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/$/)
  })
})
