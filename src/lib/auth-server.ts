import { convexBetterAuthReactStart } from '@convex-dev/better-auth/react-start'
import { getToken as fetchToken } from '@convex-dev/better-auth/utils'
import { getRequestHeaders } from '@tanstack/react-start/server'
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
export const getToken = cache(
  async () =>
    (
      await fetchToken(
        env.VITE_CONVEX_SITE_URL,
        backendHeaders(getRequestHeaders())
      )
    ).token
)
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
