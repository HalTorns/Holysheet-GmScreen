import type { ErrorEvent, BrowserOptions } from '@sentry/tanstackstart-react'

export const privateTelemetryOptions = {
  tracesSampleRate: 0,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
    frameContextLines: 0,
  },
  beforeBreadcrumb: () => null,
  beforeSendLog: () => null,
  beforeSendMetric: () => null,
  ignoreSpans: [/.*/],
  beforeSend: sanitizeError,
} satisfies BrowserOptions

// Rebuild an allowlist: exception messages, DOM, cookies and arbitrary context
// may contain recovery codes, emails or bearer tokens even when collection is off.
export function sanitizeError(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined,
    ...(event.event_id ? { event_id: event.event_id } : {}),
    ...(event.timestamp ? { timestamp: event.timestamp } : {}),
    level: 'error',
    platform: event.platform === 'node' ? 'node' : 'javascript',
    exception: {
      values: (event.exception?.values ?? []).map((value) => ({
        type: 'ApplicationError',
        value: 'Application error',
        stacktrace: {
          frames: (value.stacktrace?.frames ?? []).map((frame) => ({
            ...(frame.filename
              ? { filename: frame.filename.split(/[?#]/)[0] ?? '' }
              : {}),
            ...(frame.lineno ? { lineno: frame.lineno } : {}),
            ...(frame.colno ? { colno: frame.colno } : {}),
            in_app: frame.in_app ?? false,
          })),
        },
      })),
    },
  }
}

export function analyticsPage(
  pathname: string
): 'home' | 'sign-in' | 'application' | 'mfa' | 'other' {
  if (pathname === '/') return 'home'
  if (pathname === '/sign-in') return 'sign-in'
  if (pathname === '/verify-mfa') return 'mfa'
  if (pathname === '/app' || pathname.startsWith('/app/')) return 'application'
  return 'other'
}
