import { expect, test } from '@playwright/test'

import { spotlightUrl } from '../../scripts/local-config.mjs'
import { containsExceptionEvent } from './telemetry'

test.skip(
  !process.env.PLAYWRIGHT_SPOTLIGHT,
  'Use services:up --spotlight and the guarded spotlight launcher.'
)

// Exercise the real local sidecar and the development SDK with no Sentry DSN.
test('Spotlight receives a redacted browser exception locally', async ({
  page,
}) => {
  await page.goto('/sign-in?recovery=fake-spotlight-private')
  // The SSR title can appear before the lazy monitoring SDK initializes.
  await expect(page.getByLabel('Adresse e-mail', { exact: true })).toBeEnabled()
  const delivered = page.waitForResponse(
    (response) =>
      response.url() === `${spotlightUrl}/stream` &&
      response.request().method() === 'POST' &&
      containsExceptionEvent(response.request().postData())
  )
  const exception = page.waitForEvent('pageerror')
  await page.evaluate(() => {
    window.setTimeout(() => {
      throw new Error('fake-spotlight-private')
    }, 0)
  })
  await exception
  const response = await delivered
  expect(response.ok()).toBe(true)
  expect(
    (response.request().postData() ?? '').includes('fake-spotlight-private')
  ).toBe(false)
})
