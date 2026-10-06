import { expect, test } from '@playwright/test'
import { login } from './helpers'

// A pagina de serie ficou de fora das correcoes feitas na de filme: duracao crua e dois downloads iguais.
test('a pagina de serie mostra duracao formatada e meta em selos', async ({ page }) => {
  await page.route(/\/api\/xtream\?.*action=get_series_info/, async (route) => {
    const res = await route.fetch()
    const json = await res.json()
    for (const eps of Object.values(json.episodes as Record<string, { info: { duration: string } }[]>)) {
      for (const ep of eps) ep.info.duration = '00:48:00'
    }
    await route.fulfill({ response: res, json })
  })

  await login(page)
  await page.goto('/series/50')
  await expect(page.getByRole('heading', { name: 'Série Dramática' })).toBeVisible()

  await expect(page.getByText('48min').first()).toBeVisible()
  await expect(page.getByText('00:48:00')).toHaveCount(0)
  await expect(page.getByText('2 temporadas')).toBeVisible()
})
