import { expect, test } from '@playwright/test'
import { login } from './helpers'

// The lineup used to be logo tiles with no information: knowing what was on meant leaving for the guide.
test('the channel list shows what is on now, with a progress bar', async ({ page }) => {
  await login(page)
  await page.goto('/live')

  // stream_id 101 ("Canal Notícias 24h") in the mock catalog — see e2e/mock-xtream.mjs.
  const card = page.getByTestId('live-card-101')
  await expect(card.getByText('Canal Notícias 24h')).toBeVisible()
  // The mock names programs after the current half-hour slot, so match the shape, not a fixed time.
  await expect(card.getByText(/Programa \d{1,2}h\d{2}/)).toBeVisible({ timeout: 10000 })
  await expect(card.getByText(/até \d{2}:\d{2}/)).toBeVisible()
})

test('favoriting a channel lifts it into "Seus canais"', async ({ page }) => {
  await login(page)
  await page.goto('/live')
  await expect(page.getByText('Canal Clima')).toBeVisible()

  await page.getByRole('button', { name: 'Favoritar Canal Clima' }).click()
  const section = page.locator('section', { hasText: 'Seus canais' })
  await expect(section).toBeVisible()
  await expect(section.getByText('Canal Clima')).toBeVisible()

  // And it leaves again when unfavorited, instead of sticking around until a reload.
  await section.getByRole('button', { name: 'Remover Canal Clima dos favoritos' }).click()
  await expect(page.locator('section', { hasText: 'Seus canais' })).toHaveCount(0)
})

test('on a phone the catch-up filter sits behind "Filtrar"', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.goto('/live')

  const catchUp = page.getByRole('button', { name: 'Com catch-up' })
  await expect(catchUp).toBeHidden()
  await page.getByRole('button', { name: 'Filtrar' }).click()
  await expect(catchUp).toBeVisible()
  await catchUp.click()
  await expect(catchUp).toHaveAttribute('aria-pressed', 'true')
})

// O cache e stale-while-revalidate: entrega o guardado (de ate 24h) e so depois atualiza. Para "o que
// esta no ar agora" isso mostrava o programa de ontem como se fosse o atual.
test('nao mostra como atual um programa que ja terminou', async ({ page }) => {
  const ontem = new Date(Date.now() - 20 * 3600_000)
  const stamp = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')

  await page.route(/\/api\/xtream\?.*action=get_short_epg/, (route) =>
    route.fulfill({
      json: {
        epg_listings: [
          {
            id: '1',
            title: btoa('Programa de ontem'),
            description: btoa(''),
            start: stamp(ontem),
            end: stamp(new Date(ontem.getTime() + 3600_000)),
          },
        ],
      },
    }),
  )

  await login(page)
  await page.goto('/live')
  const card = page.getByTestId('live-card-101')
  await expect(card.getByText('Canal Notícias 24h')).toBeVisible()
  await expect(card.getByText('Sem programação')).toBeVisible()
  await expect(card.getByText('Programa de ontem')).toHaveCount(0)
})
