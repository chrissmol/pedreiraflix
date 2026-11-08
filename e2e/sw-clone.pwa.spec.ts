import { expect, test } from '@playwright/test'

// Regressao: networkFirst clonava a resposta DEPOIS de o navegador ja ter consumido o corpo
// ("Failed to execute 'clone' on 'Response': Response body is already used", sw.js) e a pagina nunca era guardada.
test('o service worker guarda a pagina aberta no cache', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true))
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await page.goto('/login?teste-clone=1')
  await expect
    .poll(() => page.evaluate(async () => !!(await caches.match('/login?teste-clone=1', { ignoreVary: true }))))
    .toBe(true)
})
