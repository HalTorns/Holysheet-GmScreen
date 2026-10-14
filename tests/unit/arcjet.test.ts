import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})
// The untrusted header boundary owns IP attribution. Live Arcjet service rules
// require an operator's key; this case never substitutes a fake allow decision.
test('an enabled auth perimeter rejects forged forwarded IPs without contacting Arcjet', async () => {
  vi.stubEnv('ARCJET_ENABLED', 'true')
  vi.stubEnv('ARCJET_KEY', 'local-test-key')
  vi.stubEnv('ARCJET_PROXY_SECRET', 'local-proxy-proof-for-testing-only-32')
  vi.stubEnv('AUTH_PROXY_SECRET', 'local-backend-proof-for-testing-only-32')
  const { protectAuthRequest } = await import('../../src/lib/security/arcjet')
  const response = await protectAuthRequest(
    new Request('http://localhost:3000/api/auth/sign-in/email-otp', {
      headers: {
        'x-forwarded-for': '192.0.2.1',
        'x-starter-client-ip': '192.0.2.1',
        'x-starter-proxy-key': 'forged',
      },
    })
  )
  expect(response?.status).toBe(403)
})
