import { privateTelemetryOptions } from '@shared/telemetry'

import { env } from '@/env'

export async function initializeClientMonitoring() {
  const spotlight = import.meta.env.DEV && env.VITE_SPOTLIGHT_ENABLED
  if (!env.VITE_SENTRY_DSN && !spotlight) return
  try {
    const Sentry = await import('@sentry/tanstackstart-react')
    Sentry.init({
      ...privateTelemetryOptions,
      ...(env.VITE_SENTRY_DSN ? { dsn: env.VITE_SENTRY_DSN } : {}),
      // The browser SDK requires its integration; the Node spotlight option
      // alone does not initialize browser handlers when no DSN is configured.
      integrations: (defaults) =>
        spotlight
          ? [
              ...defaults,
              Sentry.spotlightBrowserIntegration({
                sidecarUrl: 'http://localhost:8969/stream',
              }),
            ]
          : defaults,
      environment: import.meta.env.DEV ? 'development' : 'production',
    })
  } catch {
    console.warn('Monitoring unavailable; application remains usable.')
  }
}
