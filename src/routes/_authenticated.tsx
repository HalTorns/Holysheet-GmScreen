import { convexQuery } from '@convex-dev/react-query'
import { api } from '@convex/_generated/api'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { useQuery, useConvexAuth } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Brand } from '@/components/brand'
import { ErrorState, LoadingState } from '@/components/page-state'
import { Button } from '@/components/ui/button'
import {
  appNavigation,
  organizationsNavigation,
  supportNavigation,
  adminNavigation,
} from '@/config/navigation'
import { ProfileOnboarding } from '@/features/account/display-name-form'
import { ImpersonationBanner } from '@/features/admin/support-panel'
import { authErrorMessage } from '@/features/auth/errors'
import { IdentityConfirmationProvider } from '@/features/auth/identity-confirmation'
import { WriteReadinessProvider } from '@/features/auth/write-readiness'
import { authClient } from '@/lib/auth-client'
import { ensureConvexQuery } from '@/lib/convex-query'

const currentUserQuery = convexQuery(api.auth.getCurrentUser, {})
const capabilitiesQuery = convexQuery(api.capabilities.get, {})

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    // TanStack Router uses thrown redirect objects for navigation control flow.
    if (!context.isAuthenticated) throw redirect({ to: '/sign-in' })
  },
  loader: async ({ context }) => {
    const user = await context.queryClient.query<
      FunctionReturnType<typeof api.auth.getCurrentUser>
    >({
      queryKey: currentUserQuery.queryKey,
      staleTime: 'static',
    })
    if (!user) {
      const access = await ensureConvexQuery(
        context.queryClient,
        api.auth.getAccessState,
        {}
      )
      throw redirect({ to: access?.requiresMfa ? '/verify-mfa' : '/sign-in' })
    }
    await ensureConvexQuery(context.queryClient, api.capabilities.get, {})
    return {
      userId: user.id,
      onboarding: user.requiresName,
      name: user.name,
      profileVersion: user.profileVersion,
    }
  },
  head: () => ({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] }),
  pendingComponent: LoadingState,
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const browserSession = authClient.useSession()
  const access = useQuery(api.auth.getAccessState, {})
  const { data: user } = useSuspenseQuery(currentUserQuery)
  const { data: capabilities } = useSuspenseQuery(capabilitiesQuery)
  const { isAuthenticated, isLoading } = useConvexAuth()
  const initial = Route.useLoaderData()
  const { userId: validatedUserId } = initial
  const [onboarding, setOnboarding] = useState(initial.onboarding)
  const accountChanged =
    (user !== null && user.id !== validatedUserId) ||
    (browserSession.data?.user.id !== undefined &&
      browserSession.data.user.id !== validatedUserId)
  useEffect(() => {
    // A different account needs a fresh document and fresh query caches.
    if (accountChanged) window.location.reload()
  }, [accountChanged])
  if (accountChanged) return <LoadingState />
  const expired = !isLoading && (!isAuthenticated || !user)

  return (
    <div className="app-layout">
      <ImpersonationBanner />
      <header className="app-header page-container">
        <Brand />
        <nav
          className="app-navigation flex-wrap"
          aria-label="Navigation de votre espace"
        >
          {[
            ...appNavigation,
            ...(access?.isSupport ? [supportNavigation] : []),
            ...(access?.isAdmin ? [adminNavigation] : []),
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
        {/* The route loader already validates the session. Keep the page and
            its drafts mounted while Convex confirms a refreshed token: a
            transient unauthenticated state used to unmount the whole outlet
            and reset local state. Writes stay disabled until Convex confirms
            the token, and every backend access still revalidates the live
            session and resource permissions. */}
        {expired && <SessionExpiredState />}
        <fieldset
          className="contents"
          disabled={expired || isLoading || Boolean(access?.isImpersonating)}
          aria-label="Contenu de votre espace"
        >
          <WriteReadinessProvider value={!expired && !isLoading}>
            <IdentityConfirmationProvider key={validatedUserId}>
              {onboarding && !access?.isImpersonating ? (
                <ProfileOnboarding
                  name={user?.name ?? initial.name}
                  profileVersion={
                    user?.profileVersion ?? initial.profileVersion
                  }
                  hasName={user?.hasName ?? false}
                  onComplete={() => setOnboarding(false)}
                />
              ) : (
                <Outlet />
              )}
            </IdentityConfirmationProvider>
          </WriteReadinessProvider>
        </fieldset>
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
