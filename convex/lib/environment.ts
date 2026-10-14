import { createEnv } from '@t3-oss/env-core'

import { invalidEnvironment, publicOrigin } from '../../shared/environment'
import { z } from '../../shared/zod'
import type { AuthSettings } from '../authOptions'

export function getAuthSettings(): AuthSettings {
  const env = createEnv({
    server: {
      SITE_URL: publicOrigin,
      BETTER_AUTH_SECRET: z.string().min(32),
      PASSKEY_RP_ID: z.string().min(1),
    },
    runtimeEnvStrict: {
      SITE_URL: process.env.SITE_URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      PASSKEY_RP_ID: process.env.PASSKEY_RP_ID,
    },
    isServer: true,
    onValidationError: invalidEnvironment,
  })
  const siteUrl = new URL(env.SITE_URL)
  const isLocal = ['localhost', '127.0.0.1'].includes(siteUrl.hostname)
  if (
    siteUrl.protocol !== 'https:' &&
    !(isLocal && siteUrl.protocol === 'http:')
  ) {
    throw new Error('SITE_URL must use HTTPS outside localhost.')
  }
  if (
    siteUrl.pathname !== '/' ||
    siteUrl.search ||
    siteUrl.hash ||
    siteUrl.username ||
    siteUrl.password
  ) {
    throw new Error(
      'SITE_URL must be an origin without path, credentials or query.'
    )
  }
  const secret = env.BETTER_AUTH_SECRET
  if (secret.length < 32)
    throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.')
  const passkeyRpId = env.PASSKEY_RP_ID
  if (passkeyRpId !== siteUrl.hostname) {
    throw new Error('PASSKEY_RP_ID must exactly match the SITE_URL hostname.')
  }
  return { siteUrl: siteUrl.origin, secret, passkeyRpId }
}
