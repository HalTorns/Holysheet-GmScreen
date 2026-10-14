import {
  featureFlag,
  invalidEnvironment,
  publicOrigin,
  telemetryDsn,
} from '@shared/environment'
import { z } from '@shared/zod'
import { createEnv } from '@t3-oss/env-core'

export const env = createEnv({
  clientPrefix: 'VITE_',
  client: {
    VITE_SITE_URL: publicOrigin,
    VITE_CONVEX_URL: publicOrigin,
    VITE_CONVEX_SITE_URL: publicOrigin,
    VITE_POSTHOG_KEY: z.string().min(1).optional(),
    VITE_POSTHOG_HOST: publicOrigin.default('https://eu.i.posthog.com'),
    VITE_SENTRY_DSN: telemetryDsn.optional(),
    VITE_SPOTLIGHT_ENABLED: featureFlag,
  },
  runtimeEnvStrict: {
    VITE_SITE_URL: import.meta.env.VITE_SITE_URL,
    VITE_CONVEX_URL: import.meta.env.VITE_CONVEX_URL,
    VITE_CONVEX_SITE_URL: import.meta.env.VITE_CONVEX_SITE_URL,
    VITE_POSTHOG_KEY: import.meta.env.VITE_POSTHOG_KEY,
    VITE_POSTHOG_HOST: import.meta.env.VITE_POSTHOG_HOST,
    VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
    VITE_SPOTLIGHT_ENABLED: import.meta.env.VITE_SPOTLIGHT_ENABLED,
  },
  emptyStringAsUndefined: true,
  onValidationError: invalidEnvironment,
})
