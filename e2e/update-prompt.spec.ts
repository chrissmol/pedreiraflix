import { expect, test } from '@playwright/test'
import { login } from './helpers'

// The real waiting-worker handoff needs two different builds served in sequence, which e2e can't stage —
// so the registration is stubbed and what's exercised is this app's own logic: noticing a worker that is
// already waiting, and telling it to take over.
test('an update that is ready offers itself, and accepting tells the worker to take over', async ({ page }) => {
  await page.addInitScript(() => {
    const waiting = {
      postMessage: (data: unknown) => {
        ;(window as unknown as { __skipWaiting?: unknown }).__skipWaiting = data
      },
      addEventListener: () => {},
    }
    Object.defineProperty(navigator.serviceWorker, 'getRegistration', {
      configurable: true,
      value: () => Promise.resolve({ waiting, installing: null, update: () => Promise.resolve(), addEventListener: () => {} }),
    })
  })

  await login(page)
  await expect(page.getByText('Nova versão disponível')).toBeVisible()

  await page.getByRole('button', { name: 'Atualizar' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __skipWaiting?: { type?: string } }).__skipWaiting?.type))
    .toBe('SKIP_WAITING')
})

test('the offer can be dismissed', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.serviceWorker, 'getRegistration', {
      configurable: true,
      value: () =>
        Promise.resolve({
          waiting: { postMessage: () => {}, addEventListener: () => {} },
          installing: null,
          update: () => Promise.resolve(),
          addEventListener: () => {},
        }),
    })
  })

  await login(page)
  await page.getByRole('button', { name: 'Agora não' }).click()
  await expect(page.getByText('Nova versão disponível')).toHaveCount(0)
})

test('nothing is shown when there is no update waiting', async ({ page }) => {
  await login(page)
  await expect(page.getByText('Nova versão disponível')).toHaveCount(0)
})
