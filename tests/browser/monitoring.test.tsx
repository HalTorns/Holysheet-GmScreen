import * as Sentry from '@sentry/tanstackstart-react'
import { expect, test } from 'vitest'

import { privateTelemetryOptions } from '../../shared/telemetry'

// Distinct from the pure redaction test: this owns SDK processing/transport,
// which could add private context after our event sanitizer during an upgrade.
test('the Sentry SDK transport emits a redacted error without recovery context', async () => {
  let envelope = ''
  Sentry.init({
    ...privateTelemetryOptions,
    dsn: 'https://public@example.test/1',
    transport: () => ({
      send: (value: unknown) => {
        envelope = JSON.stringify(value)
        return Promise.resolve({})
      },
      flush: () => Promise.resolve(true),
    }),
  })
  try {
    Sentry.setUser({ email: 'fake-private-recovery-secret' })
    Sentry.captureException(new Error('fake-private-recovery-secret'), {
      extra: { code: 'fake-private-recovery-secret' },
    })
    await Sentry.flush(2000)
    expect(envelope).toContain('event_id')
    expect(envelope).not.toContain('fake-private-recovery-secret')
  } finally {
    await Sentry.close(2000)
  }
})
