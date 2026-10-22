import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config'
import type { AuthConfig } from 'convex/server'

const provider = getAuthConfigProvider()
// CONVEX_SITE_URL is built in, including the first deployment of a fresh restore.
// Loopback issuers are local Docker deployments: only JWKS transport uses the
// internal port. Public/production issuers and their transport stay unchanged.
if (/^http:\/\/(127\.0\.0\.1|localhost)(?::[0-9]+)?$/.test(provider.issuer))
  provider.jwks = 'http://127.0.0.1:3211/api/auth/convex/jwks'

export default {
  providers: [provider],
} satisfies AuthConfig
