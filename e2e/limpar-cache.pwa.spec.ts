import { expect, test } from '@playwright/test'
import { login } from './helpers'

// "Limpar cache" tem de esvaziar tudo que e cache (CacheStorage, catalogo no IndexedDB, service worker), mostrar
// o espaco liberado, manter login/favoritos e, depois do recarregamento, voltar a guardar o app para o modo offline.
test('Limpar cache esvazia os caches, mostra o espaco liberado e preserva os dados do usuario', async ({ page }) => {
  await login(page)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await page.getByRole('link', { name: 'Filmes' }).click()
  await expect(page.getByRole('button', { name: 'Filme Explosivo Filme' }).first()).toBeVisible()
  await page.evaluate(() => localStorage.setItem('iptv-library', '{"state":{"favorites":[{"id":"1"}]},"version":0}'))

  const contagem = () =>
    page.evaluate(async () => {
      const keys = await caches.keys()
      let itens = 0
      for (const k of keys) itens += (await (await caches.open(k)).keys()).length
      const regs = (await navigator.serviceWorker.getRegistrations()).length
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('pedreiraflix-cache')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      const idb = await new Promise<number>((res) => {
        const r = db.transaction('entries').objectStore('entries').count()
        r.onsuccess = () => res(r.result)
      })
      db.close()
      return { itens, regs, idb }
    })

  const antes = await contagem()
  expect(antes.itens).toBeGreaterThan(0)
  expect(antes.idb).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Conta', exact: true }).click()
  await page.getByRole('button', { name: 'Limpar cache' }).click()
  await page.getByRole('button', { name: 'Limpar', exact: true }).click()
  await expect(page.getByText(/Cache limpo: .* liberados/)).toBeVisible()

  await page.waitForEvent('load')
  // Depois do recarregamento: login e favoritos intactos e o app se guarda de novo (precache refeito).
  await expect(page.getByRole('button', { name: 'Conta', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('iptv-library'))).toContain('favorites')
  await page.waitForFunction(() => navigator.serviceWorker.getRegistrations().then((r) => r.length > 0))
  await expect.poll(async () => (await contagem()).itens, { timeout: 20000 }).toBeGreaterThan(0)
})
