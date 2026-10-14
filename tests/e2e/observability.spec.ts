import { expect, test } from '@playwright/test'

import { containsExceptionEvent } from './telemetry'

test.skip(
  !process.env.PLAYWRIGHT_OBSERVABILITY,
  'Use the guarded local observability launcher.'
)

// Real production bundles and CSP, real SDKs, intercepted SaaS transports.
// Browser Mode owns payload shaping; this owns activation/delivery under CSP.
test('optional analytics and error monitoring work under the production CSP', async ({
  page,
}) => {
  // The SDK intentionally excludes webdriver/headless browsers. Simulate a
  // human here only, while preserving the SDK's production bot filtering.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined })
  })
  let cspViolations = 0
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) cspViolations += 1
  })
  let analytics = 0
  let envelope = ''
  await page.route('https://analytics.example.test/**', async (route) => {
    if (route.request().method() === 'POST') analytics += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: '{"status":1}',
    })
  })
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
  expect(response?.headers()['content-security-policy']).toContain(
    "'strict-dynamic'"
  )
  await expect(page).toHaveTitle(/Socle/)
  await expect.poll(() => analytics).toBeGreaterThan(0)
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
  await expect(page).toHaveTitle(/Socle/)
})
