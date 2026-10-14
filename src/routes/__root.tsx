import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'
import type { ConvexQueryClient } from '@convex-dev/react-query'
import { appConfig } from '@shared/app-config'
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Toaster } from 'sonner'

import { Button } from '@/components/ui/button'
import { OptionalAnalytics } from '@/features/observability/analytics'
import { authClient } from '@/lib/auth-client'
import { getToken } from '@/lib/auth-server'

import stylesheet from '@/styles.css?url'

const getAuthToken = createServerFn({ method: 'GET' }).handler(() => getToken())

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
  convexQueryClient: ConvexQueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: `${appConfig.name} · ${appConfig.tagline}` },
      {
        name: 'description',
        content: appConfig.description,
      },
    ],
    links: [
      { rel: 'stylesheet', href: stylesheet },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const token = await getAuthToken()
    if (token) context.convexQueryClient.serverHttpClient?.setAuth(token)
    return { token, isAuthenticated: Boolean(token) }
  },
  component: Root,
  notFoundComponent: () => (
    <main className="status-page">
      <h1>Page introuvable</h1>
      <Link to="/">Retour à l’accueil</Link>
    </main>
  ),
  errorComponent: ({ reset }) => (
    <main className="status-page">
      <h1>Une erreur est survenue</h1>
      <p>Réessayez dans quelques instants.</p>
      <Button onClick={reset}>Réessayer</Button>
    </main>
  ),
})

function Root() {
  const context = Route.useRouteContext()
  return (
    <html lang={appConfig.language}>
      <head>
        <HeadContent />
      </head>
      <body>
        <ConvexBetterAuthProvider
          client={context.convexQueryClient.convexClient}
          authClient={authClient}
          initialToken={context.token ?? null}
        >
          <OptionalAnalytics>
            <Outlet />
          </OptionalAnalytics>
          <Toaster richColors position="bottom-right" />
        </ConvexBetterAuthProvider>
        <Scripts />
      </body>
    </html>
  )
}
