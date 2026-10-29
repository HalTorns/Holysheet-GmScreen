import { expect, test } from '@playwright/test'

import { waitForHydration } from './helpers'
import { containsExceptionEvent } from './telemetry'

test.skip(
  !process.env.PLAYWRIGHT_OBSERVABILITY,
  'Use the guarded local observability launcher.'
)

// Real production bundles and CSP, real SDKs, intercepted SaaS transports.
// Browser Mode owns payload shaping; this owns activation/delivery under CSP.
test('optional error monitoring work under the production CSP', async ({
  page,
}) => {
  let cspViolations = 0
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) cspViolations += 1
  })
  let envelope = ''
  await page.route('https://errors.example.test/**', async (route) => {
    if (route.request().method() === 'POST')
      envelope = route.request().postData() ?? ''
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: '{}',
    })
  })
  const response = await page.goto('/?recovery=fake-observability-private')
  await waitForHydration(page)
  expect(response?.headers()['content-security-policy']).toContain(
    "'strict-dynamic'"
  )
  await expect(page).toHaveTitle(/Holysheet/g)
  envelope = ''
  const exception = page.waitForEvent('pageerror')
  await page.evaluate(() => {
    window.setTimeout(() => {
      throw new Error('fake-observability-private')
    }, 0)
  })
  await exception
  await expect.poll(() => containsExceptionEvent(envelope)).toBe(true)
  expect(envelope.includes('fake-observability-private')).toBe(false)
  expect(cspViolations).toBe(0)
  await expect(page).toHaveTitle(/Holysheet/g)
})
