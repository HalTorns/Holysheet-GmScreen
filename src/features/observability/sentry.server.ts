import type * as SentrySdk from '@sentry/tanstackstart-react'
import { privateTelemetryOptions } from '@shared/telemetry'

import { serverEnv } from '@/env.server'

let sdk: Promise<typeof SentrySdk | null> | undefined
export function serverMonitoring() {
  const spotlight = import.meta.env.DEV && serverEnv.SPOTLIGHT_ENABLED
  if (!serverEnv.SENTRY_DSN && !spotlight) return null
  sdk ??= import('@sentry/tanstackstart-react')
    .then((Sentry) => {
      Sentry.init({
        ...privateTelemetryOptions,
        ...(serverEnv.SENTRY_DSN ? { dsn: serverEnv.SENTRY_DSN } : {}),
        spotlight: spotlight ? 'http://localhost:8969/stream' : false,
        environment: import.meta.env.DEV ? 'development' : 'production',
        integrations: (defaults) =>
          defaults.filter(
            (integration) =>
              !['LocalVariables', 'Console', 'ConsoleLogs'].includes(
                integration.name
              )
          ),
      })
      return Sentry
    })
    .catch(() => {
      console.warn('Monitoring unavailable; application remains usable.')
      return null
    })
  return sdk
}
