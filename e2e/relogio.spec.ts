import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Cada card de canal criava o proprio setInterval de 1 minuto (centenas numa lista longa). Agora ha um relogio
// compartilhado: o numero de temporizadores nao cresce com o numero de canais.
test('a lista de canais usa um unico relogio de 1 minuto, nao um por card', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __minuteTimers: number }
    w.__minuteTimers = 0
    const orig = window.setInterval.bind(window)
    window.setInterval = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => {
      if (ms === 60_000) w.__minuteTimers++
      return orig(fn, ms, ...rest)
    }) as typeof window.setInterval
  })
  await login(page)
  await page.goto('/live')
  // Os 6 canais do mock mostram programa (barra de progresso) — um card por canal.
  await expect(page.locator('[data-testid^="live-card-"]')).toHaveCount(6)
  await expect(page.getByText(/Programa \d+h\d+/).first()).toBeVisible()
  await expect(page.getByText(/Programa \d+h\d+/)).toHaveCount(6)

  const timers = await page.evaluate(() => (window as unknown as { __minuteTimers: number }).__minuteTimers)
  expect(timers).toBe(1) // era 6 (um por canal) antes do relogio compartilhado
})
