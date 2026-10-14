import {
  featureFlag,
  invalidEnvironment,
  optionalSecret,
  telemetryDsn,
} from '@shared/environment'
import { z } from '@shared/zod'
import { createEnv } from '@t3-oss/env-core'

export const serverEnv = createEnv({
  server: {
    ARCJET_KEY: optionalSecret,
    ARCJET_ENABLED: featureFlag,
    ARCJET_PROXY_SECRET: z.string().min(32).optional(),
    AUTH_PROXY_SECRET: z.string().min(32).optional(),
    SENTRY_DSN: telemetryDsn.optional(),
    SPOTLIGHT_ENABLED: featureFlag,
  },
  runtimeEnvStrict: {
    ARCJET_KEY: process.env.ARCJET_KEY,
    ARCJET_ENABLED: process.env.ARCJET_ENABLED,
    ARCJET_PROXY_SECRET: process.env.ARCJET_PROXY_SECRET,
    AUTH_PROXY_SECRET: process.env.AUTH_PROXY_SECRET,
    SENTRY_DSN: process.env.SENTRY_DSN,
    SPOTLIGHT_ENABLED: process.env.SPOTLIGHT_ENABLED,
  },
  isServer: true,
  emptyStringAsUndefined: true,
  onValidationError: invalidEnvironment,
})
if (
  serverEnv.ARCJET_ENABLED &&
  (!serverEnv.ARCJET_KEY ||
    !serverEnv.ARCJET_PROXY_SECRET ||
    !serverEnv.AUTH_PROXY_SECRET)
)
  invalidEnvironment()
