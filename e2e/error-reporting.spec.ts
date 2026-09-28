import { expect, test } from '@playwright/test'
import { seedSession } from './helpers'

test('an uncaught error is reported to /api/log-error', async ({ page }) => {
  await seedSession(page)
  await page.goto('/')

  const reportPromise = page.waitForRequest(
    (req) => req.url().includes('/api/log-error') && req.method() === 'POST',
  )
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('test-uncaught-error')
    }, 0)
  })
  const req = await reportPromise
  const body = req.postDataJSON()
  expect(body.message).toContain('test-uncaught-error')
})
