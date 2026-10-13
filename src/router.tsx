import { ConvexQueryClient } from '@convex-dev/react-query'
import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import {
  createIsomorphicFn,
  getGlobalStartContext,
} from '@tanstack/react-start'
import { z } from '@shared/zod'
import { env } from '@/env'
import { routeTree } from './routeTree.gen'

const getRequestNonce = createIsomorphicFn()
  .server(
    () =>
      z.object({ nonce: z.string().min(1) }).parse(getGlobalStartContext())
        .nonce,
  )
  .client(() => undefined)

export function getRouter() {
  const nonce = getRequestNonce()
  // A new router and its clients for each server request prevent cross-account caches.
  const convexQueryClient = new ConvexQueryClient(env.VITE_CONVEX_URL, {
    expectAuth: true,
  })
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        retry: false,
      },
    },
  })
  convexQueryClient.connect(queryClient)
  const router = createRouter({
    routeTree,
    context: { queryClient, convexQueryClient },
    defaultPreload: 'intent',
    scrollRestoration: true,
    ssr: nonce ? { nonce } : {},
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
    server: { requestContext: { nonce: string } }
  }
}
