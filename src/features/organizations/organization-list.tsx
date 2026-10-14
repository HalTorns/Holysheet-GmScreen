import { convexQuery } from '@convex-dev/react-query'
import { api } from '@convex/_generated/api'
import {
  organizationSchema,
  organizationRoleLabels,
} from '@shared/organizations'
import { useForm } from '@tanstack/react-form'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, useHydrated, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Building2, Plus } from 'lucide-react'
import { useState } from 'react'

import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { operationErrorMessage } from '@/features/auth/errors'

export function OrganizationList() {
  const { data: organizations } = useSuspenseQuery(
    convexQuery(api.organizations.list, {})
  )
  const { data: invitations } = useSuspenseQuery(
    convexQuery(api.organizations.invitations, {})
  )
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">COLLABORER, AVEC DES DROITS CLAIRS</p>
          <h1>Mes organisations.</h1>
          <p>Votre espace personnel reste accessible à tout moment.</p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid content-start gap-4">
          {organizations.length === 0 && (
            <div className="panel p-6">
              <Building2 aria-hidden="true" className="mb-4 text-primary" />
              <h2 className="font-semibold">Un espace à partager.</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Créez une organisation ou acceptez une invitation pour
                commencer.
              </p>
            </div>
          )}
          {organizations.map((organization) => (
            <Link
              key={organization.id}
              to="/app/organizations/$organizationId"
              params={{ organizationId: organization.id }}
              className="panel flex min-w-0 items-center justify-between gap-4 p-6 transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {organization.name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Ouvrir les ressources et les membres
                </span>
              </span>
              <span className="text-xs text-primary">
                {organizationRoleLabels[organization.role]}
              </span>
            </Link>
          ))}
          {invitations.length > 0 && (
            <section
              aria-labelledby="invitations-heading"
              className="panel p-6"
            >
              <h2 id="invitations-heading" className="mb-4 font-semibold">
                Invitations reçues
              </h2>
              <div className="grid gap-5">
                {invitations.map((invitation) => (
                  <InvitationCard key={invitation.id} invitation={invitation} />
                ))}
              </div>
            </section>
          )}
        </div>
        <CreateOrganizationForm />
      </div>
    </>
  )
}

function CreateOrganizationForm() {
  const createOrganization = useMutation(api.organizations.create)
  const navigate = useNavigate()
  const hydrated = useHydrated()
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { name: '' },
    validators: { onSubmit: organizationSchema },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        const id = await createOrganization(organizationSchema.parse(value))
        await navigate({
          to: '/app/organizations/$organizationId',
          params: { organizationId: id },
        })
      } catch (error) {
        setError(operationErrorMessage(error))
      }
    },
  })
  return (
    <section
      className="panel h-fit p-6"
      aria-labelledby="new-organization-heading"
    >
      <h2 id="new-organization-heading" className="mb-2 font-semibold">
        Créer une organisation
      </h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Vous en serez le premier propriétaire. Une connexion récente est
        nécessaire.
      </p>
      <form
        method="post"
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <div className="form-field">
              <label htmlFor="organization-name">Nom de l’organisation</label>
              <Input
                id="organization-name"
                name={field.name}
                maxLength={80}
                required
                minLength={2}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-describedby="organization-name-error"
                disabled={!hydrated || form.state.isSubmitting}
              />
              <FormError
                id="organization-name-error"
                errors={field.state.meta.errors}
                isTouched={field.state.meta.isTouched}
              />
            </div>
          )}
        </form.Field>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(pending) => (
            <Button type="submit" disabled={!hydrated || pending}>
              <Plus aria-hidden="true" />
              {pending ? 'Création…' : 'Créer l’organisation'}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </section>
  )
}

function InvitationCard({
  invitation,
}: {
  invitation: FunctionReturnType<typeof api.organizations.invitations>[number]
}) {
  const respond = useMutation(api.organizations.respondToInvitation)
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(accept: boolean) {
    setPending(true)
    setError(null)
    try {
      const id = await respond({ invitationId: invitation.id, accept })
      if (accept)
        await navigate({
          to: '/app/organizations/$organizationId',
          params: { organizationId: id },
        })
    } catch (error) {
      setError(operationErrorMessage(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <article className="grid gap-3 border-t pt-4 first:border-0 first:pt-0">
      <div>
        <h3 className="font-medium">{invitation.organizationName}</h3>
        <p className="text-sm text-muted-foreground">
          Invitation au rôle{' '}
          {organizationRoleLabels[invitation.role].toLowerCase()}.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => void submit(true)}>
          Accepter l’invitation
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => void submit(false)}
        >
          Refuser
        </Button>
      </div>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </article>
  )
}
