import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { login } from './helpers'

// "Baixar série inteira (ZIP)": baixa os episódios e entrega um .zip com uma pasta por temporada.
test('baixar série inteira entrega um zip com pastas por temporada', async ({ page }) => {
  // Sem a janela "salvar como" (nao automatizavel): cai no download comum do navegador.
  await page.addInitScript(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  await login(page)
  await page.goto('/series/50')
  await expect(page.getByRole('heading', { name: 'Série Dramática' })).toBeVisible()

  const download = page.waitForEvent('download', { timeout: 30000 })
  await page.getByRole('button', { name: 'Baixar série inteira (ZIP)' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('Série Dramática.zip')

  const path = await file.path()
  const py = 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("\\n".join(z.namelist()))'
  const names = execFileSync('python3', ['-I', '-c', py, path]).toString().trim().split('\n')
  expect(names.length).toBeGreaterThanOrEqual(3)
  for (const n of names) expect(n).toMatch(/^Série Dramática\/Temporada \d\d\/E\d\d - .+\.\w+$/)
  await expect(page.getByText('ZIP salvo.')).toBeVisible()
})
