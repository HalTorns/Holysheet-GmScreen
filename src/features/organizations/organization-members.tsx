import { useForm } from '@tanstack/react-form'
import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useHydrated } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@convex/_generated/api'
import {
  canManageOrganizationMembers,
  organizationRoleLabels,
  organizationRoleSchema,
  organizationRoles,
  type OrganizationRole,
} from '@shared/organizations'
import { emailSchema } from '@shared/validation'
import { z } from '@shared/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { FormError } from '@/components/form-error'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useState } from 'react'
import { useOrganizationOperation } from './use-organization-operation'

type OrganizationData = FunctionReturnType<typeof api.organizations.get>
const invitationSchema = z.object({
  email: emailSchema,
  role: z.enum(['admin', 'member', 'viewer']),
})
type InvitationInput = z.infer<typeof invitationSchema>
const initialInvitation: InvitationInput = { email: '', role: 'member' }

export function OrganizationMembers({ data }: { data: OrganizationData }) {
  const canManage = canManageOrganizationMembers(data.organization.role)
  return (
    <section
      className="security-section panel"
      aria-labelledby="members-heading"
    >
      <div className="security-section-title">
        <div>
          <h2 id="members-heading">Membres et accès</h2>
          <p>
            Les lecteurs consultent les ressources. Les membres peuvent les
            modifier. Les administrateurs gèrent les accès courants.
          </p>
        </div>
      </div>
      {data.members.map((member) => (
        <MemberRow
          key={member.userId}
          member={member}
          organization={data.organization}
        />
      ))}
      {canManage && (
        <div className="grid gap-6 border-t pt-6">
          <InviteForm organization={data.organization} />
          {data.invitations.length > 0 && (
            <div className="grid gap-3">
              <h3 className="font-semibold">Invitations en attente</h3>
              {data.invitations.map((invitation) => (
                <PendingInvitation
                  key={invitation.id}
                  invitation={invitation}
                  actorRole={data.organization.role}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function InviteForm({
  organization,
}: {
  organization: OrganizationData['organization']
}) {
  const invite = useMutation(api.organizations.invite)
  const hydrated = useHydrated()
  const operation = useOrganizationOperation()
  const form = useForm({
    defaultValues: initialInvitation,
    validators: { onSubmit: invitationSchema },
    onSubmit: async ({ value }) => {
      if (
        await operation.run(() =>
          invite({
            organizationId: organization.id,
            ...invitationSchema.parse(value),
          }),
        )
      )
        form.reset()
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
      <div>
        <h3 className="font-semibold">Inviter un membre</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          L’invitation sera visible dans son espace après connexion avec cette
          adresse. Elle expire après sept jours.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <form.Field name="email">
          {(field) => (
            <div className="form-field">
              <label htmlFor="invitation-email">Adresse e-mail du membre</label>
              <Input
                id="invitation-email"
                name={field.name}
                type="email"
                maxLength={254}
                required
                disabled={!hydrated || operation.pending}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-describedby="invitation-email-error"
              />
              <FormError
                id="invitation-email-error"
                errors={field.state.meta.errors}
                isTouched={field.state.meta.isTouched}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="role">
          {(field) => (
            <div className="form-field">
              <label htmlFor="invitation-role">Rôle à l’arrivée</label>
              <Select
                id="invitation-role"
                name={field.name}
                value={field.state.value}
                disabled={operation.pending}
                onChange={(event) => {
                  const role = invitationSchema.shape.role.safeParse(
                    event.target.value,
                  )
                  if (role.success) field.handleChange(role.data)
                }}
              >
                <option value="member">Membre</option>
                <option value="viewer">Lecteur</option>
                {organization.role === 'owner' && (
                  <option value="admin">Administrateur</option>
                )}
              </Select>
            </div>
          )}
        </form.Field>
      </div>
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
        {operation.pending ? 'Invitation…' : 'Inviter ce membre'}
      </Button>
    </form>
  )
}

function MemberRow({
  member,
  organization,
}: {
  member: OrganizationData['members'][number]
  organization: OrganizationData['organization']
}) {
  const changeRole = useMutation(api.organizations.changeRole)
  const { data: user } = useSuspenseQuery(
    convexQuery(api.auth.getCurrentUser, {}),
  )
  const operation = useOrganizationOperation()
  const canEdit =
    organization.role === 'owner' ||
    (organization.role === 'admin' &&
      (member.role === 'member' || member.role === 'viewer'))
  const roles =
    organization.role === 'owner'
      ? organizationRoles
      : (['member', 'viewer'] as const)
  const displayName = member.name || member.email || 'Membre'
  return (
    <div className="security-row flex-wrap gap-3">
      <div className="max-w-full min-w-0">
        <h3 className="truncate">
          {displayName}
          {member.userId === user?.id ? ' (vous)' : ''}
        </h3>
        {member.email && <p className="break-all">{member.email}</p>}
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-2">
        {canEdit ? (
          <>
            <label htmlFor={`role-${member.userId}`} className="sr-only">
              Rôle de {displayName}
            </label>
            <Select
              className="w-44"
              id={`role-${member.userId}`}
              value={member.role}
              disabled={operation.pending}
              onChange={(event) => {
                const role = organizationRoleSchema.safeParse(
                  event.target.value,
                )
                if (role.success)
                  void operation.run(() =>
                    changeRole({
                      organizationId: organization.id,
                      userId: member.userId,
                      role: role.data,
                    }),
                  )
              }}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {organizationRoleLabels[role]}
                </option>
              ))}
            </Select>
            <RemoveMemberDialog
              organizationId={organization.id}
              member={member}
            />
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {organizationRoleLabels[member.role]}
          </span>
        )}
      </div>
      {operation.error && (
        <p role="alert" className="field-error basis-full">
          {operation.error}
        </p>
      )}
    </div>
  )
}

function RemoveMemberDialog({
  organizationId,
  member,
}: {
  organizationId: string
  member: OrganizationData['members'][number]
}) {
  const remove = useMutation(api.organizations.removeMember)
  const operation = useOrganizationOperation()
  const [open, setOpen] = useState(false)
  const displayName = member.name || member.email || 'Membre'
  async function submit() {
    if (
      await operation.run(() =>
        remove({ organizationId, userId: member.userId }),
      )
    )
      setOpen(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!operation.pending) setOpen(next)
      }}
    >
      <DialogTrigger
        render={<Button size="sm" variant="outline" />}
        aria-label={`Retirer ${displayName}`}
      >
        Retirer
      </DialogTrigger>
      <DialogContent showCloseButton={!operation.pending}>
        <DialogTitle>Retirer ce membre ?</DialogTitle>
        <DialogDescription>
          {displayName} perdra immédiatement l’accès aux ressources communes.
          Ses données personnelles restent intactes.
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
          <Button
            variant="destructive"
            disabled={operation.pending}
            onClick={() => void submit()}
          >
            Confirmer le retrait
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PendingInvitation({
  invitation,
  actorRole,
}: {
  invitation: OrganizationData['invitations'][number]
  actorRole: OrganizationRole
}) {
  const cancel = useMutation(api.organizations.cancelInvitation)
  const operation = useOrganizationOperation()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div className="min-w-0">
        <p className="text-sm break-all">{invitation.email}</p>
        <p className="text-xs text-muted-foreground">
          {organizationRoleLabels[invitation.role]}
        </p>
      </div>
      {(actorRole === 'owner' || invitation.role !== 'admin') && (
        <Button
          size="sm"
          variant="ghost"
          disabled={operation.pending}
          onClick={() =>
            void operation.run(() => cancel({ invitationId: invitation.id }))
          }
          aria-label={`Annuler l’invitation de ${invitation.email}`}
        >
          Annuler l’invitation
        </Button>
      )}
      {operation.error && (
        <p role="alert" className="field-error basis-full">
          {operation.error}
        </p>
      )}
    </div>
  )
}
