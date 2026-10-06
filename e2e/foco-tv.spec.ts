import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Numa TV o foco e a unica forma de saber onde se esta; no Windows ajuda quem navega por teclado.
test('todo elemento focado por teclado mostra um anel visivel', async ({ page }) => {
  await login(page)
  await page.goto('/live')
  await expect(page.getByText('Canal Clima')).toBeVisible()

  // Um botao que NAO usa a classe brand-focus: antes dependia do anel padrao do navegador.
  const star = page.getByRole('button', { name: 'Favoritar Canal Clima' })
  await star.press('Tab')
  await star.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')

  const outline = await star.evaluate((el) => {
    const s = getComputedStyle(el)
    return { width: s.outlineWidth, style: s.outlineStyle }
  })
  expect(outline.style).not.toBe('none')
  expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2)
})

test('clique de mouse nao deixa anel de foco para tras', async ({ page }) => {
  await login(page)
  await page.goto('/live')
  // Medido: o Chromium reporta `outline-width: 3px` mesmo com `outline-style: none`, ou seja, mesmo sem
  // desenhar anel nenhum. Era por isso que este teste oscilava — ele olhava a largura. O que diz se o
  // anel aparece e o ESTILO.
  const filtro = page.getByRole('button', { name: 'Com catch-up' })
  await filtro.hover()
  await page.mouse.down()
  await page.mouse.up()

  const estado = await filtro.evaluate((el) => ({
    focusVisible: el.matches(':focus-visible'),
    estilo: getComputedStyle(el).outlineStyle,
  }))
  expect(estado.focusVisible).toBe(false)
  expect(estado.estilo).toBe('none')
})
