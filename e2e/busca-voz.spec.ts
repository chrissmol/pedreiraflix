import { expect, test, type Page } from '@playwright/test'
import { seedSession } from './helpers'

/** Reconhecimento de voz falso do navegador: "ouve" a frase dada e termina. */
async function fakeVoice(page: Page, phrase: string) {
  await page.addInitScript((phrase) => {
    class FakeRecognition {
      lang = ''
      interimResults = false
      maxAlternatives = 1
      onresult: ((e: unknown) => void) | null = null
      onerror: (() => void) | null = null
      onend: (() => void) | null = null
      start() {
        ;(window as unknown as { __vozLang: string }).__vozLang = this.lang
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: phrase }]] })
          this.onend?.()
        }, 200)
      }
      abort() {}
    }
    // O Chromium novo ja traz SpeechRecognition sem prefixo: troca os dois.
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition })
  }, phrase)
}

test.beforeEach(async ({ page }) => {
  await seedSession(page)
})

test('computador: o microfone do campo do topo busca o que foi falado, em portugues', async ({ page }) => {
  await fakeVoice(page, 'corrida final')
  await page.goto('/')
  await page.getByRole('button', { name: 'Buscar por voz' }).first().click()
  await expect(page).toHaveURL(/\/search\?q=corrida/)
  await expect(page.getByRole('heading', { name: 'Resultados para "corrida final"' })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __vozLang: string }).__vozLang)).toBe('pt-BR')
})

test('sem reconhecimento de voz no navegador o microfone nao aparece', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
  })
  await page.goto('/search')
  await expect(page.getByLabel('Buscar no catálogo')).toBeAttached()
  await expect(page.getByRole('button', { name: 'Buscar por voz' })).toHaveCount(0)
})

test.describe('app do Windows', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0 PedreiraFlixDesktop' })
  test('no app do Windows (WebView2 nao ouve) o microfone nao aparece', async ({ page }) => {
    await fakeVoice(page, 'qualquer')
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Conta', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Buscar por voz' })).toHaveCount(0)
  })
})

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test('celular: microfone na pagina de busca preenche o campo e busca', async ({ page }) => {
    await fakeVoice(page, 'série dramática')
    await page.goto('/search')
    await page.getByRole('button', { name: 'Buscar por voz' }).click()
    await expect(page.getByLabel('Buscar no catálogo')).toHaveValue('série dramática')
    await expect(page).toHaveURL(/q=s%C3%A9rie/)
  })
})

test.describe('TV', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    viewport: { width: 960, height: 540 },
  })
  test('TV: com setas chega no microfone da busca e OK busca pelo que foi falado', async ({ page }) => {
    await fakeVoice(page, 'esporte')
    await page.goto('/search')
    await expect(page.getByLabel('Buscar no catálogo')).toBeAttached()
    for (let i = 0; i < 10; i++) {
      const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
      if (label === 'Buscar por voz') break
      await page.keyboard.press('ArrowRight')
    }
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Buscar por voz')
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Buscar no catálogo')).toHaveValue('esporte')
  })
})
