import { expect, test } from 'vitest'

import { serializeJsonLd } from '../../shared/seo'
import { sanitizeError, analyticsPage } from '../../shared/telemetry'

// The SDK transport consumes this allowlist. Arbitrary error/request data must
// not survive it; E2E owns actual SSR/CSP serialization and auth callback flow.
test('telemetry strips arbitrary recovery secrets and private URLs', () => {
  const secret = 'private-recovery-secret'
  const event = sanitizeError({
    type: undefined,
    message: secret,
    user: { email: secret },
    request: {
      url: `https://example.test/callback?token=${secret}`,
      cookies: { session: secret },
      data: secret,
    },
    extra: { code: secret },
    breadcrumbs: [{ message: secret }],
    exception: {
      values: [
        {
          value: secret,
          stacktrace: {
            frames: [
              {
                filename: `app.js?token=${secret}`,
                lineno: 7,
                vars: { code: secret },
                context_line: secret,
              },
            ],
          },
        },
      ],
    },
  })
  expect(JSON.stringify(event)).not.toContain(secret)
  expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.lineno).toBe(7)
  expect(analyticsPage('/app/organizations/private-id')).toBe('application')
})
test('JSON-LD cannot terminate its script element', () => {
  const payload = { name: '</script><script>alert(1)</script>\u2028' }
  const serialized = serializeJsonLd(payload)
  expect(serialized).not.toContain('<')
  expect(JSON.parse(serialized)).toEqual(payload)
})
