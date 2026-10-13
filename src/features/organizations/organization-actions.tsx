import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useHydrated, useNavigate } from '@tanstack/react-router'
import { useConvex, useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useState } from 'react'
import { api } from '@convex/_generated/api'
import { appConfig } from '@shared/app-config'
import { MAX_PAGE_SIZE } from '@shared/validation'
import {
  canManageOrganizationMembers,
  organizationSchema,
} from '@shared/organizations'
import { z } from '@shared/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError } from '@/components/form-error'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useOrganizationOperation } from './use-organization-operation'

type Organization = FunctionReturnType<
  typeof api.organizations.get
>['organization']

export function OrganizationActions({
  organization,
}: {
  organization: Organization
}) {
  return (
    <section
      className="security-section panel"
      aria-labelledby="organization-data-heading"
    >
      <div className="security-section-title">
        <div>
          <h2 id="organization-data-heading">Organisation et données</h2>
          <p>
            Les actions sensibles demandent une connexion récente. Votre espace
            personnel est indépendant de cette organisation.
          </p>
        </div>
      </div>
      {canManageOrganizationMembers(organization.role) && (
        <RenameOrganizationForm organization={organization} />
      )}
      {canManageOrganizationMembers(organization.role) && (
        <div className="security-row">
          <div>
            <h3>Exporter les ressources communes</h3>
            <p>Une copie JSON réservée aux administrateurs et propriétaires.</p>
          </div>
          <ExportOrganizationButton organization={organization} />
        </div>
      )}
      <div className="security-row">
        <div>
          <h3>Quitter l’organisation</h3>
          <p>
            Vous perdez l’accès partagé ; les données communes restent
            disponibles aux autres membres.
          </p>
        </div>
        <LeaveOrganizationDialog organization={organization} />
      </div>
      {organization.role === 'owner' && (
        <div className="security-row">
          <div>
            <h3>Supprimer l’organisation</h3>
            <p>Ferme tous les accès et supprime les ressources communes.</p>
          </div>
          <DeleteOrganizationDialog organization={organization} />
        </div>
      )}
    </section>
  )
}

function RenameOrganizationForm({
  organization,
}: {
  organization: Organization
}) {
  const rename = useMutation(api.organizations.rename)
  const operation = useOrganizationOperation()
  const hydrated = useHydrated()
  const form = useForm({
    defaultValues: { name: organization.name },
    validators: { onSubmit: organizationSchema },
    onSubmit: async ({ value }) => {
      await operation.run(() =>
        rename({
          organizationId: organization.id,
          ...organizationSchema.parse(value),
        }),
      )
    },
  })
  return (
    <form
      method="post"
      className="grid gap-4 border-t py-5"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => (
          <div className="form-field">
            <label htmlFor="organization-rename">Nom de l’organisation</label>
            <Input
              id="organization-rename"
              name={field.name}
              maxLength={80}
              minLength={2}
              required
              disabled={!hydrated || operation.pending}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-describedby="organization-rename-error"
            />
            <FormError
              id="organization-rename-error"
              errors={field.state.meta.errors}
              isTouched={field.state.meta.isTouched}
            />
          </div>
        )}
      </form.Field>
      {operation.error && (
        <p role="alert" className="field-error">
          {operation.error}
        </p>
      )}
      <Button
        type="submit"
        className="w-fit"
        disabled={!hydrated || operation.pending}
      >
        {operation.pending ? 'Enregistrement…' : 'Renommer l’organisation'}
      </Button>
    </form>
  )
}

function ExportOrganizationButton({
  organization,
}: {
  organization: Organization
}) {
  const convex = useConvex()
  const operation = useOrganizationOperation()
  async function download() {
    await operation.run(async () => {
      let cursor: string | null = null
      let done = false
      const resources: FunctionReturnType<
        typeof api.organizations.exportResources
      >['page'] = []
      while (!done) {
        const page: FunctionReturnType<
          typeof api.organizations.exportResources
        > = await convex.query(api.organizations.exportResources, {
          organizationId: organization.id,
          paginationOpts: { numItems: MAX_PAGE_SIZE, cursor },
        })
        resources.push(...page.page)
        done = page.isDone
        if (!done && cursor === page.continueCursor)
          throw new Error('Export pagination did not progress')
        cursor = page.continueCursor
      }
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                organization: { id: organization.id, name: organization.name },
                resources,
                exportedAt: new Date().toISOString(),
              },
              null,
              2,
            ),
          ],
          { type: 'application/json' },
        ),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `${appConfig.exportPrefix}-organisation.json`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    })
  }
  return (
    <div className="grid gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={operation.pending}
        onClick={() => void download()}
      >
        {operation.pending ? 'Export…' : 'Exporter l’organisation'}
      </Button>
      {operation.error && (
        <p role="alert" className="field-error">
          {operation.error}
        </p>
      )}
    </div>
  )
}

function LeaveOrganizationDialog({
  organization,
}: {
  organization: Organization
}) {
  const removeMember = useMutation(api.organizations.removeMember)
  const { data: user } = useSuspenseQuery(
    convexQuery(api.auth.getCurrentUser, {}),
  )
  const navigate = useNavigate()
  const operation = useOrganizationOperation()
  const [open, setOpen] = useState(false)
  async function leave() {
    if (!user) return
    await operation.run(async () => {
      await removeMember({ organizationId: organization.id, userId: user.id })
      await navigate({ to: '/app/organizations' })
    })
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!operation.pending) setOpen(next)
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Quitter l’organisation
      </DialogTrigger>
      <DialogContent showCloseButton={!operation.pending}>
        <DialogTitle>Quitter {organization.name} ?</DialogTitle>
        <DialogDescription>
          Vos données personnelles seront conservées. Un dernier propriétaire
          doit d’abord transférer son rôle à un autre membre.
        </DialogDescription>
        {operation.error && (
          <p role="alert" className="field-error">
            {operation.error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose
            render={<Button variant="outline" />}
            disabled={operation.pending}
          >
            Annuler
          </DialogClose>
          <Button disabled={operation.pending} onClick={() => void leave()}>
            Confirmer mon départ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeleteOrganizationDialog({
  organization,
}: {
  organization: Organization
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next)
      }}
    >
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        Supprimer l’organisation
      </DialogTrigger>
      <DialogContent showCloseButton={!pending}>
        <DialogTitle>Supprimer {organization.name} ?</DialogTitle>
        <DialogDescription>
          Cette action est définitive. Tous les membres perdront l’accès et les
          ressources communes seront supprimées. Exportez-les avant de
          continuer.
        </DialogDescription>
        <DeleteOrganizationForm
          organizationId={organization.id}
          onPendingChange={setPending}
        />
      </DialogContent>
    </Dialog>
  )
}

function DeleteOrganizationForm({
  organizationId,
  onPendingChange,
}: {
  organizationId: string
  onPendingChange: (pending: boolean) => void
}) {
  const remove = useMutation(api.organizations.remove)
  const navigate = useNavigate()
  const hydrated = useHydrated()
  const operation = useOrganizationOperation()
  const form = useForm({
    defaultValues: { confirmation: '' },
    validators: {
      onSubmit: z.object({
        confirmation: z.literal('SUPPRIMER', {
          error: 'Saisissez SUPPRIMER pour confirmer.',
        }),
      }),
    },
    onSubmit: async () => {
      onPendingChange(true)
      try {
        await operation.run(async () => {
          await remove({ organizationId, confirmation: 'DELETE' })
          await navigate({ to: '/app/organizations' })
        })
      } finally {
        onPendingChange(false)
      }
    },
  })
  return (
    <form
      method="post"
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="confirmation">
        {(field) => (
          <div className="form-field">
            <label htmlFor="organization-confirmation">
              Saisissez SUPPRIMER pour l’organisation
            </label>
            <Input
              id="organization-confirmation"
              name={field.name}
              autoComplete="off"
              required
              disabled={!hydrated || operation.pending}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-describedby="organization-confirmation-error"
            />
            <FormError
              id="organization-confirmation-error"
              errors={field.state.meta.errors}
              isTouched={field.state.meta.isTouched}
            />
          </div>
        )}
      </form.Field>
      {operation.error && (
        <p role="alert" className="field-error">
          {operation.error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose
          render={<Button variant="outline" />}
          disabled={operation.pending}
        >
          Annuler
        </DialogClose>
        <Button
          type="submit"
          variant="destructive"
          className="h-auto min-h-11 max-w-full whitespace-normal"
          disabled={!hydrated || operation.pending}
        >
          {operation.pending
            ? 'Suppression…'
            : 'Supprimer définitivement l’organisation'}
        </Button>
      </div>
    </form>
  )
}
