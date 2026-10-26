import { createEnv } from '@t3-oss/env-core'

import {
  featureFlag,
  invalidEnvironment,
  optionalSecret,
} from '../../shared/environment'
import { z } from '../../shared/zod'

export function getAuthModules() {
  const env = createEnv({
    server: {
      AUTH_MAGIC_LINK_ENABLED: featureFlag,
      AUTH_MFA_ENABLED: featureFlag,
      AUTH_CREDENTIALS_ENABLED: featureFlag,
      AUTH_PASSWORD_ONLY: featureFlag,
      AUTH_ADMIN_ENABLED: featureFlag,
      AUTH_GOOGLE_ENABLED: featureFlag,
      AUTH_GITHUB_ENABLED: featureFlag,
      AUTH_PROXY_REQUIRED: featureFlag,
      AUTH_PROXY_SECRET: z.string().min(32).optional(),
      GOOGLE_CLIENT_ID: optionalSecret,
      GOOGLE_CLIENT_SECRET: optionalSecret,
      GITHUB_CLIENT_ID: optionalSecret,
      GITHUB_CLIENT_SECRET: optionalSecret,
      ADMIN_USER_IDS: z
        .string()
        .default('')
        .transform((value) =>
          value
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        ),
    },
    runtimeEnv: process.env,
    isServer: true,
    emptyStringAsUndefined: true,
    onValidationError: invalidEnvironment,
  })
  if (
    env.AUTH_GOOGLE_ENABLED &&
    (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
  )
    invalidEnvironment()
  if (
    env.AUTH_GITHUB_ENABLED &&
    (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET)
  )
    invalidEnvironment()
  if (env.ADMIN_USER_IDS.length > 20) invalidEnvironment()
  if (env.AUTH_PROXY_REQUIRED && !env.AUTH_PROXY_SECRET) invalidEnvironment()
  return env
}
