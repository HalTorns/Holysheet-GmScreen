import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

// This is Convex's deployed JWT validation contract, not an import/source grep.
// Docker E2E owns live key retrieval; these cases own exact issuer preservation,
// including canonical HTTP origins with the default port omitted.
test.each([
  ['http://127.0.0.1:3411', 'http://127.0.0.1:3211/api/auth/convex/jwks'],
  ['http://localhost', 'http://127.0.0.1:3211/api/auth/convex/jwks'],
  ['http://127.0.0.1', 'http://127.0.0.1:3211/api/auth/convex/jwks'],
  [
    'https://auth.example.test',
    'https://auth.example.test/api/auth/convex/jwks',
  ],
])(
  'JWT issuer %s keeps its identity and uses the appropriate JWKS transport',
  async (issuer, jwks) => {
    vi.stubEnv('CONVEX_SITE_URL', issuer)
    vi.resetModules()
    const { default: config } = await import('../../convex/auth.config')
    expect(config.providers).toEqual([
      {
        type: 'customJwt',
        issuer,
        jwks,
        applicationID: 'convex',
        algorithm: 'RS256',
      },
    ])
  }
)
