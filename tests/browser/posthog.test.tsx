import { PostHog } from 'posthog-js'
import { expect, test, vi } from 'vitest'

import { analyticsOptions } from '../../src/features/observability/analytics-options'

// Own the SDK's required-field contract: a redactor which removes its public
// ingestion token silently drops events. No remote analytics service is called.
test('PostHog keeps a sendable page event while dropping private properties', () => {
  const request = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{}', { status: 200 }))
  const client = new PostHog()
  try {
    client.init('public-test-project', {
      ...analyticsOptions('public-test-project', 'https://example.test'),
      api_transport: 'fetch',
      // Headless Chromium is classified as a bot; exercise a human capture.
      opt_out_useragent_filter: true,
      disable_compression: true,
    })
    const event = client.capture('page_viewed', {
      page: 'application',
      secret: 'fake-private-recovery-secret',
      $set: { email: 'fake-private-recovery-secret' },
    })
    expect(Boolean(event)).toBe(true)
    expect(event?.properties.token).toBe('public-test-project')
    expect(JSON.stringify(event)).not.toContain('fake-private-recovery-secret')
    expect(
      client.capture('arbitrary_event', {
        secret: 'fake-private-recovery-secret',
      })
    ).toBeUndefined()
  } finally {
    client.opt_out_capturing()
    request.mockRestore()
  }
})
