import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'

import { api } from '@convex/_generated/api'
import { Brand } from '@/components/brand'
import { ErrorState, LoadingState } from '@/components/page-state'
import { Button } from '@/components/ui/button'
import { authErrorMessage } from '@/features/auth/errors'
import { authClient } from '@/lib/auth-client'
import { appNavigation, organizationsNavigation } from '@/config/navigation'
import { ensureConvexQuery } from '@/lib/convex-query'

const currentUserQuery = convexQuery(api.auth.getCurrentUser, {})
const capabilitiesQuery = convexQuery(api.capabilities.get, {})

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    // TanStack Router uses thrown redirect objects for navigation control flow.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (!context.isAuthenticated) throw redirect({ to: '/sign-in' })
  },
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData<
      FunctionReturnType<typeof api.auth.getCurrentUser>
    >({
      queryKey: currentUserQuery.queryKey,
      staleTime: Infinity,
    })
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- Router navigation control flow.
    if (!user) throw redirect({ to: '/sign-in' })
    await ensureConvexQuery(context.queryClient, api.capabilities.get, {})
    return { userId: user.id }
  },
  pendingComponent: LoadingState,
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { data: user } = useSuspenseQuery(currentUserQuery)
  const { data: capabilities } = useSuspenseQuery(capabilitiesQuery)
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { userId: validatedUserId } = Route.useLoaderData()
  const accountChanged = user !== null && user.id !== validatedUserId
  useEffect(() => {
    // A different account needs a fresh document and fresh query caches.
    if (accountChanged) window.location.reload()
  }, [accountChanged])
  if (accountChanged) return <LoadingState />
  if (!user && !isLoading) return <SessionExpiredState />

  return (
    <div className="app-layout">
      <header className="app-header page-container">
        <Brand />
        <nav
          className="app-navigation flex-wrap"
          aria-label="Navigation de votre espace"
        >
          {[
            ...appNavigation,
            ...(capabilities.organizations ? [organizationsNavigation] : []),
          ].map(({ label, icon: Icon, ...link }) => (
            <Link key={link.to} {...link} className="app-nav-link">
              <Icon aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <SignOutButton />
      </header>
      <main id="main-content" className="app-main page-container">
        {/* The route loader already validates the session. Keep drafts mounted
            while Convex confirms a refreshed token; every backend access still
            revalidates the live session and resource permissions. */}
        {isAuthenticated || isLoading ? (
          <Outlet key={validatedUserId} />
        ) : (
          <SessionExpiredState />
        )}
      </main>
      <footer className="page-container flex flex-wrap justify-between gap-3 border-t py-6 text-xs text-muted-foreground">
        <span className="max-w-full truncate">{user?.email}</span>
        <span>Votre espace personnel.</span>
      </footer>
    </div>
  )
}

function SignOutButton() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function signOut() {
    setIsPending(true)
    setError(null)
    try {
      const result = await authClient.signOut()
      if (result.error) {
        setError(authErrorMessage(result.error.code))
        return
      }
      window.location.assign('/')
    } catch {
      setError('La déconnexion a échoué. Réessayez.')
    } finally {
      setIsPending(false)
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => void signOut()}
      >
        <LogOut aria-hidden="true" />
        <span>{isPending ? 'Déconnexion…' : 'Déconnexion'}</span>
      </Button>
      {error && (
        <p className="field-error max-w-52 text-right" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function SessionExpiredState() {
  return (
    <div className="page-state">
      <h1 className="font-semibold text-foreground">Votre session a expiré.</h1>
      <p>Reconnectez-vous pour retrouver votre espace.</p>
      <Button render={<Link to="/sign-in" />} nativeButton={false}>
        Se reconnecter
      </Button>
    </div>
  )
}
