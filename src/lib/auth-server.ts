import { convexBetterAuthReactStart } from '@convex-dev/better-auth/react-start'
import { z } from '@shared/zod'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { getSessionCookie } from 'better-auth/cookies'
import { ConvexHttpClient } from 'convex/browser'
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from 'convex/server'
import { cache } from 'react'

import { env } from '@/env'
import { serverEnv } from '@/env.server'

const integration = convexBetterAuthReactStart({
  convexUrl: env.VITE_CONVEX_URL,
  convexSiteUrl: env.VITE_CONVEX_SITE_URL,
})
function backendHeaders(source: Headers) {
  const headers = new Headers(source)
  headers.delete('x-starter-auth-proxy')
  headers.delete('x-starter-proxy-key')
  headers.delete('x-starter-client-ip')
  headers.delete('content-length')
  headers.delete('transfer-encoding')
  if (serverEnv.AUTH_PROXY_SECRET)
    headers.set('x-starter-auth-proxy', serverEnv.AUTH_PROXY_SECRET)
  return headers
}
export function handler(request: Request) {
  // Nitro may provide a Request from another implementation/realm. Construct
  // from its URL and stream instead of relying on instanceof Request.
  const options = {
    method: request.method,
    headers: backendHeaders(request.headers),
    body: request.body,
    duplex: 'half',
  } as const
  return integration.handler(new Request(request.url, options))
}
// React cache is scoped to the current SSR request; no extra session/JWT cache.
export const getToken = cache(async () => {
  const source = getRequestHeaders()
  // With no session cookie there is nothing to validate or renew. Presence
  // alone never authorizes access: every presented cookie is checked below.
  if (!getSessionCookie(source)) return undefined
  const url = new URL('/api/auth/convex/token', env.VITE_CONVEX_SITE_URL)
  // SSR does not forward this response's cookies. Leave the sliding refresh to
  // the browser, which can receive and persist its renewed session cookie.
  url.searchParams.set('disableRefresh', 'true')
  const headers = backendHeaders(source)
  headers.set('host', url.host)
  let response: Response
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new Error('Le service de connexion est momentanément indisponible.')
  }
  if (response.status === 401 || response.status === 403) return undefined
  // A quota or outage does not invalidate the cookie. Let the route offer a
  // retry instead of turning a successful login into a second OTP challenge.
  if (!response.ok)
    throw new Error('Le service de connexion est momentanément indisponible.')
  const result = z
    .object({ token: z.string().min(1) })
    .safeParse(await response.json().catch(() => null))
  if (!result.success)
    throw new Error('Le service de connexion est momentanément indisponible.')
  return result.data.token
})
async function client() {
  const result = new ConvexHttpClient(env.VITE_CONVEX_URL)
  const token = await getToken()
  if (token) result.setAuth(token)
  return result
}
export async function fetchAuthQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgs<Query>
): Promise<FunctionReturnType<Query>> {
  return (await client()).query(query, ...args)
}
