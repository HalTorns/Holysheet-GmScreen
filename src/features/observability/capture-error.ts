import { createIsomorphicFn } from '@tanstack/react-start'

import { env } from '@/env'

const captureApplicationError = createIsomorphicFn()
  .server(async (error: unknown) => {
    const { serverMonitoring } = await import('./sentry.server')
    const monitoring = await serverMonitoring()
    monitoring?.captureException(error)
  })
  .client(async (error: unknown) => {
    if (
      !env.VITE_SENTRY_DSN &&
      !(import.meta.env.DEV && env.VITE_SPOTLIGHT_ENABLED)
    )
      return
    const Sentry = await import('@sentry/tanstackstart-react')
    Sentry.captureException(error)
  })

export function reportApplicationError(error: unknown) {
  // Monitoring failures must not replace the application's error handling.
  void captureSafely(error)
}

async function captureSafely(error: unknown) {
  try {
    await captureApplicationError(error)
  } catch {
    /* Optional monitoring cannot replace application behavior. */
  }
}
