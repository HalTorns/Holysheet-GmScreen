import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

// The real env entry must ignore stale analytics settings, including a host
// which would have failed the old URL validator. Sentry remains validated.
test('retired PostHog environment variables do not prevent startup', async () => {
  vi.stubEnv('VITE_SITE_URL', 'http://localhost:3000')
  vi.stubEnv('VITE_CONVEX_URL', 'http://localhost:3210')
  vi.stubEnv('VITE_CONVEX_SITE_URL', 'http://localhost:3211')
  vi.stubEnv('VITE_POSTHOG_KEY', 'obsolete-public-key')
  vi.stubEnv('VITE_POSTHOG_HOST', 'obsolete-invalid-host')
  const { env } = await import('../../src/env')
  expect(env.VITE_SITE_URL).toBe('http://localhost:3000')
  expect(env).not.toHaveProperty('VITE_POSTHOG_KEY')
  expect(env).not.toHaveProperty('VITE_POSTHOG_HOST')
})
