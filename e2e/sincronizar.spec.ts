import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { login, seedSession } from './helpers'

// /api/sync de mentira, dividido entre os dois "aparelhos" (o Worker com D1 tem teste proprio em worker/sync.test.mjs).
async function sharedSync(context: BrowserContext, store: Map<string, string>) {
  await context.route('**/api/sync', async (route) => {
    const key = (await route.request().headerValue('x-sync-key')) ?? ''
    if (route.request().method() === 'PUT') {
      store.set(key, route.request().postData() ?? '{}')
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ contentType: 'application/json', body: store.get(key) ?? '{}' })
  })
}
// Sair do app manda na hora o que ainda estava esperando o minuto.
const hide = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })

test('favorito feito no celular aparece na TV da mesma conta, e o favorito antigo da TV nao some', async ({ browser }) => {
  const store = new Map<string, string>()
  const celular = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const tv = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })
  await sharedSync(celular, store)
  await sharedSync(tv, store)

  // A TV ja tinha um favorito de antes da sincronizacao existir.
  const tvPage = await tv.newPage()
  await seedSession(tvPage)
  await tvPage.goto('/movies/2')
  await tvPage.getByRole('button', { name: 'Minha lista' }).click()
  await expect(tvPage.getByRole('button', { name: 'Na lista' })).toBeVisible()
  await tvPage.evaluate(() => {
    // Volta ao formato de antes (sem data), como um aparelho que so atualizou o app agora.
    const saved = JSON.parse(localStorage.getItem('iptv-library')!)
    saved.state.favoritesAt = {}
    localStorage.setItem('iptv-library', JSON.stringify(saved))
  })

  const phone = await celular.newPage()
  await login(phone)
  await phone.goto('/movies/1')
  await phone.getByRole('button', { name: 'Minha lista' }).click()
  const pushed = phone.waitForRequest((r) => r.url().endsWith('/api/sync') && r.method() === 'PUT')
  await hide(phone)
  await pushed

  await tvPage.reload()
  await tvPage.goto('/movies/1')
  await expect(tvPage.getByRole('button', { name: 'Na lista' })).toBeVisible()
  await tvPage.goto('/movies/2')
  await expect(tvPage.getByRole('button', { name: 'Na lista' })).toBeVisible()

  await celular.close()
  await tv.close()
})

test('perfil criado e perfil marcado como infantil no computador chegam na TV', async ({ browser }) => {
  const store = new Map<string, string>()
  const computador = await browser.newContext()
  const tv = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })
  await sharedSync(computador, store)
  await sharedSync(tv, store)

  const pc = await computador.newPage()
  await login(pc)
  await pc.getByRole('button', { name: 'Conta', exact: true }).click()
  await pc.getByRole('button', { name: 'Gerenciar perfis' }).click()
  await pc.getByRole('button', { name: 'Ajustes' }).click()
  await pc.getByLabel('Perfil infantil').check()
  await pc.getByRole('button', { name: 'Fechar' }).click()
  await pc.getByRole('button', { name: 'Adicionar perfil' }).click()
  await pc.getByPlaceholder('Nome do perfil').fill('Vovó')
  await pc.getByRole('button', { name: 'Criar' }).click()
  await expect(pc.getByText('Vovó')).toBeVisible()
  // Perfil mexido sincroniza na hora; espera chegar a versao com os dois perfis.
  await expect.poll(() => [...store.values()].join('')).toContain('Vovó')

  const tvPage = await tv.newPage()
  await seedSession(tvPage)
  await tvPage.goto('/movies')
  await expect(tvPage.getByText('Filme Explosivo').first()).toBeVisible()
  await expect(tvPage.getByText('Filme Adulto')).toHaveCount(0)
  await tvPage.goto('/profiles')
  await expect(tvPage.getByText('Vovó')).toBeVisible()

  await computador.close()
  await tv.close()
})
