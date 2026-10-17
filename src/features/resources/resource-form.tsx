import { api } from '@convex/_generated/api'
import {
  RESOURCE_DESCRIPTION_MAX_LENGTH,
  RESOURCE_TITLE_MAX_LENGTH,
  resourceSchema,
} from '@shared/validation'
import { useForm } from '@tanstack/react-form'
import { useHydrated } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DraftGuard } from '@/components/draft-guard'
import { FormDialogContent as DialogContent } from '@/components/form-dialog-content'
import { FormError } from '@/components/form-error'
import { SaveActions } from '@/components/save-actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { operationErrorMessage } from '@/features/auth/errors'
import type { Resource } from '@/features/resources/types'

export function ResourceDialog({
  open,
  onOpenChange,
  resource,
  organizationId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  resource: Resource | null
  organizationId?: string
}) {
  const [isPending, setIsPending] = useState(false)
  const [dirty, setDirty] = useState(false)
  function close(nextOpen: boolean) {
    if (isPending) return
    if (
      !nextOpen &&
      dirty &&
      !window.confirm('Quitter sans enregistrer vos modifications ?')
    )
      return
    if (!nextOpen) setDirty(false)
    onOpenChange(nextOpen)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        close(nextOpen)
      }}
    >
      <DraftGuard dirty={open && dirty} />
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>
            {resource ? 'Modifier la ressource' : 'Nouvelle ressource'}
          </DialogTitle>
          <DialogDescription>
            Un titre, quelques mots et une place dans votre espace.
          </DialogDescription>
        </DialogHeader>
        <ResourceForm
          key={resource?._id ?? 'new'}
          resource={resource}
          isPending={isPending}
          onPendingChange={setIsPending}
          onDirtyChange={setDirty}
          onCancel={() => close(false)}
          onSaved={() => {
            setDirty(false)
            onOpenChange(false)
          }}
          {...(organizationId ? { organizationId } : {})}
        />
      </DialogContent>
    </Dialog>
  )
}

function ResourceForm({
  resource,
  isPending,
  onPendingChange,
  onSaved,
  onDirtyChange,
  onCancel,
  organizationId,
}: {
  resource: Resource | null
  isPending: boolean
  onPendingChange: (pending: boolean) => void
  onSaved: () => void
  onDirtyChange: (dirty: boolean) => void
  onCancel: () => void
  organizationId?: string
}) {
  const isHydrated = useHydrated()
  const createResource = useMutation(api.resources.create)
  const updateResource = useMutation(api.resources.update)
  const current = useQuery(
    api.resources.get,
    resource ? { id: resource._id } : 'skip'
  )
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(
    resource?.updatedAt ?? 0
  )
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: {
      title: resource?.title ?? '',
      description: resource?.description ?? '',
    },
    validators: { onBlur: resourceSchema, onSubmit: resourceSchema },
    onSubmit: async ({ value }) => {
      setError(null)
      onPendingChange(true)
      try {
        const validated = resourceSchema.parse(value)
        if (resource)
          await updateResource({
            id: resource._id,
            expectedUpdatedAt,
            ...validated,
          })
        else
          await createResource({
            ...validated,
            ...(organizationId ? { organizationId } : {}),
          })
        toast.success(resource ? 'Ressource mise à jour.' : 'Ressource créée.')
        onSaved()
      } catch (error) {
        setError(operationErrorMessage(error))
      } finally {
        onPendingChange(false)
      }
    },
  })

  return (
    <form
      method="post"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
      className="grid gap-5"
    >
      <form.Field name="title">
        {(field) => (
          <div className="form-field">
            <label htmlFor="resource-title">Titre</label>
            <Input
              id="resource-title"
              name={field.name}
              value={field.state.value}
              onChange={(event) => {
                field.handleChange(event.target.value)
                onDirtyChange(
                  form.state.values.title !== (resource?.title ?? '') ||
                    form.state.values.description !==
                      (resource?.description ?? '')
                )
              }}
              onBlur={field.handleBlur}
              maxLength={RESOURCE_TITLE_MAX_LENGTH}
              placeholder="Une idée à garder, un projet à poser…"
              aria-invalid={
                field.state.meta.isTouched && !field.state.meta.isValid
              }
              aria-describedby="title-error"
              required
              disabled={!isHydrated || isPending}
            />
            <FormError
              id="title-error"
              errors={field.state.meta.errors}
              isTouched={field.state.meta.isTouched}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <div className="form-field">
            <label htmlFor="resource-description">
              Description{' '}
              <span className="font-normal text-muted-foreground">
                (facultatif)
              </span>
            </label>
            <Textarea
              id="resource-description"
              name={field.name}
              value={field.state.value}
              onChange={(event) => {
                field.handleChange(event.target.value)
                onDirtyChange(
                  form.state.values.title !== (resource?.title ?? '') ||
                    form.state.values.description !==
                      (resource?.description ?? '')
                )
              }}
              onBlur={field.handleBlur}
              maxLength={RESOURCE_DESCRIPTION_MAX_LENGTH}
              rows={5}
              placeholder="Ajoutez les détails utiles pour la retrouver."
              aria-invalid={
                field.state.meta.isTouched && !field.state.meta.isValid
              }
              aria-describedby="description-error"
              disabled={!isHydrated || isPending}
            />
            <FormError
              id="description-error"
              errors={field.state.meta.errors}
              isTouched={field.state.meta.isTouched}
            />
          </div>
        )}
      </form.Field>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {error && current && current.updatedAt !== expectedUpdatedAt && (
        <div className="grid gap-3 rounded-md border p-4">
          <p>
            Version actuelle : <strong>{current.title}</strong>
          </p>
          <p className="whitespace-pre-wrap">{current.description}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setExpectedUpdatedAt(current.updatedAt)
              setError(null)
            }}
          >
            Conserver mon brouillon et reprendre sur cette version
          </Button>
        </div>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <SaveActions
            pending={isSubmitting}
            disabled={!isHydrated}
            onCancel={onCancel}
            label={
              resource ? 'Enregistrer les modifications' : 'Créer la ressource'
            }
          />
        )}
      </form.Subscribe>
    </form>
  )
}
