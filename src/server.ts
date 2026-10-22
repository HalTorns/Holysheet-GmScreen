import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'

import { env } from '@/env'
import { serverMonitoring } from '@/features/observability/sentry.server'
import { protectAuthRequest } from '@/lib/security/arcjet'

const handleRequest = createStartHandler(defaultStreamHandler)

function securityHeaders(nonce: string, requestId: string) {
  const convexOrigin = new URL(env.VITE_CONVEX_URL).origin
  const convexSocketOrigin = convexOrigin.replace(/^http/, 'ws')
  const development = import.meta.env.DEV
  const telemetryOrigins = [
    env.VITE_POSTHOG_KEY ? env.VITE_POSTHOG_HOST : '',
    env.VITE_SENTRY_DSN ? new URL(env.VITE_SENTRY_DSN).origin : '',
    development && env.VITE_SPOTLIGHT_ENABLED ? env.VITE_SPOTLIGHT_URL : '',
  ]
    .filter(Boolean)
    .join(' ')
  return {
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': [
      "default-src 'self'",
      `script-src 'self' ${development ? "'unsafe-inline'" : `'nonce-${nonce}' 'strict-dynamic'`}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src 'self' ${convexOrigin} ${convexSocketOrigin} ${telemetryOrigins}${development ? ` ${new URL(env.VITE_SITE_URL).origin.replace(/^http/, 'ws')} ws://127.0.0.1:${new URL(env.VITE_SITE_URL).port || '80'}` : ''}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=()',
    'X-Request-Id': requestId,
    ...(new URL(env.VITE_SITE_URL).protocol === 'https:'
      ? { 'Strict-Transport-Security': 'max-age=31536000' }
      : {}),
  }
}

export default {
  async fetch(request: Request) {
    const requestId = crypto.randomUUID()
    const nonce = btoa(
      String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(18)))
    )
    const startedAt = performance.now()
    try {
      const denied = await protectAuthRequest(request)
      const monitoring = await serverMonitoring()
      const handler = monitoring
        ? monitoring.wrapFetchWithSentry({
            fetch: () => handleRequest(request, { context: { nonce } }),
          })
        : { fetch: () => handleRequest(request, { context: { nonce } }) }
      const response = denied ?? (await handler.fetch(request))
      const headers = new Headers(response.headers)
      for (const [name, value] of Object.entries(
        securityHeaders(nonce, requestId)
      ))
        headers.set(name, value)
      // Do not log URLs: auth callbacks may contain secrets in query parameters.
      if (response.status >= 500)
        console.error(
          JSON.stringify({
            event: 'http_error',
            requestId,
            status: response.status,
            durationMs: Math.round(performance.now() - startedAt),
          })
        )
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch (error) {
      const monitoring = await serverMonitoring()
      monitoring?.captureException(error)
      console.error(JSON.stringify({ event: 'request_failed', requestId }))
      return new Response('Une erreur est survenue.', {
        status: 500,
        headers: securityHeaders(nonce, requestId),
      })
    }
  },
}
