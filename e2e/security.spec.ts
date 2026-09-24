import { expect, test } from '@playwright/test'
import { MOCK } from './helpers'

test('security headers are present on proxy responses', async ({ request }) => {
  const res = await request.get(
    `/api/xtream?base=${encodeURIComponent(MOCK.baseUrl)}&path=player_api.php&username=${MOCK.username}&password=${MOCK.password}`,
  )
  expect(res.headers()['x-content-type-options']).toBe('nosniff')
  expect(res.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
})

test('excessive requests to /api/xtream get rate-limited with 429', async ({ request }) => {
  const url = `/api/xtream?base=${encodeURIComponent(MOCK.baseUrl)}&path=player_api.php&username=${MOCK.username}&password=${MOCK.password}&action=get_live_categories`
  const statuses: number[] = []
  for (let i = 0; i < 110; i++) statuses.push((await request.get(url)).status())
  expect(statuses).toContain(429)
  // The very first requests, before the limit trips, must have gone through normally.
  expect(statuses[0]).toBe(200)

  // This test deliberately trips the shared-IP bucket (every request in this whole suite comes from
  // 127.0.0.1, the same as a real request would from a real client's IP) — every other spec file reuses
  // the same running proxy, so without waiting out the window here, the next test to hit /api/xtream
  // would get a false 429 that has nothing to do with what it's actually testing.
  await new Promise((resolve) => setTimeout(resolve, 10_500))
})
