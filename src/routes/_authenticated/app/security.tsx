import { convexQuery } from '@convex-dev/react-query'
import { api } from '@convex/_generated/api'
import { appConfig } from '@shared/app-config'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { UserRound } from 'lucide-react'

import { ErrorState } from '@/components/page-state'
import { DataSection } from '@/features/account/data-section'
import { DisplayNameForm } from '@/features/account/display-name-form'
import { MfaSection } from '@/features/account/mfa-section'
import { PasskeysSection } from '@/features/account/passkeys-section'
import { SessionsSection } from '@/features/account/sessions-section'

export const Route = createFileRoute('/_authenticated/app/security')({
  head: () => ({ meta: [{ title: `Mon compte — ${appConfig.name}` }] }),
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
  component: SecurityPage,
})

function SecurityPage() {
  const { data: user } = useSuspenseQuery(
    convexQuery(api.auth.getCurrentUser, {})
  )
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TOUJOURS SOUS VOTRE CONTRÔLE</p>
          <h1>Mon compte.</h1>
          <p>Gérez votre connexion, vos appareils et vos données.</p>
        </div>
      </div>
      <div className="panel flex flex-wrap items-center gap-4 px-6 py-5">
        <div className="flex size-11 items-center justify-center rounded-full bg-secondary text-primary">
          <UserRound className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {user?.name || 'Votre compte'}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {user?.email}
          </p>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          Connexion sans mot de passe
        </span>
      </div>
      <section
        className="security-section panel"
        aria-labelledby="profile-heading"
      >
        <h2 id="profile-heading">Votre pseudo</h2>
        <DisplayNameForm
          name={user?.name ?? ''}
          profileVersion={user?.profileVersion ?? 0}
        />
      </section>
      <p className="field-hint">
        Les actions sensibles vous demandent une confirmation d’identité ici, en
        conservant votre saisie.
      </p>
      <PasskeysSection />
      <MfaSection />
      <SessionsSection />
      <DataSection />
    </>
  )
}
