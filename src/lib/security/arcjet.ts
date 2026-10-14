import { timingSafeEqual, createHash } from 'node:crypto'
import { isIP } from 'node:net'

import { serverEnv } from '@/env.server'

let protection: ReturnType<typeof createProtection> | undefined
async function createProtection() {
  const {
    default: arcjet,
    shield,
    detectBot,
    tokenBucket,
  } = await import('@arcjet/node')
  return arcjet({
    key: serverEnv.ARCJET_KEY ?? '',
    proxies: [],
    rules: [
      shield({ mode: 'LIVE' }),
      detectBot({ mode: 'LIVE', allow: [] }),
      tokenBucket({
        mode: 'LIVE',
        refillRate: 30,
        interval: '1m',
        capacity: 60,
      }),
    ],
  })
}
export async function protectAuthRequest(
  request: Request
): Promise<Response | null> {
  const url = new URL(request.url)
  if (
    !serverEnv.ARCJET_ENABLED ||
    !url.pathname.startsWith('/api/auth/') ||
    url.pathname === '/api/auth/convex/jwks'
  )
    return null
  // Fetch Request has no trustworthy TCP peer. Only a perimeter which overwrites
  // both headers can attest the client IP. Never trust X-Forwarded-For directly.
  const proof = request.headers.get('x-starter-proxy-key') ?? ''
  const digest = (value: string) => createHash('sha256').update(value).digest()
  const ip = request.headers.get('x-starter-client-ip') ?? ''
  if (
    !timingSafeEqual(
      digest(proof),
      digest(serverEnv.ARCJET_PROXY_SECRET ?? '')
    ) ||
    !isIP(ip)
  )
    return new Response('Forbidden', { status: 403 })
  try {
    protection ??= createProtection()
    const decision = await (
      await protection
    ).protect(
      {
        socket: { remoteAddress: ip, encrypted: url.protocol === 'https:' },
        method: request.method,
        url: `${url.origin}${url.pathname}`,
        headers: {
          'user-agent': request.headers.get('user-agent') ?? '',
          host: url.host,
        },
      },
      { requested: 1 }
    )
    if (decision.isErrored())
      return new Response('Protection unavailable', { status: 503 })
    if (decision.isDenied())
      return new Response('Request refused', {
        status: decision.reason.isRateLimit() ? 429 : 403,
      })
    if (!decision.isAllowed())
      return new Response('Request refused', { status: 403 })
    return null
  } catch {
    return new Response('Protection unavailable', { status: 503 })
  }
}
