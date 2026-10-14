import { api } from '@convex/_generated/api'
import {
  RESOURCE_DESCRIPTION_MAX_LENGTH,
  RESOURCE_TITLE_MAX_LENGTH,
  resourceSchema,
} from '@shared/validation'
import { useForm } from '@tanstack/react-form'
import { useHydrated } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'

import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
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
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) onOpenChange(nextOpen)
      }}
    >
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
          onSaved={() => onOpenChange(false)}
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
  organizationId,
}: {
  resource: Resource | null
  isPending: boolean
  onPendingChange: (pending: boolean) => void
  onSaved: () => void
  organizationId?: string
}) {
  const isHydrated = useHydrated()
  const createResource = useMutation(api.resources.create)
  const updateResource = useMutation(api.resources.update)
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
        if (resource) await updateResource({ id: resource._id, ...validated })
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
              onChange={(event) => field.handleChange(event.target.value)}
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
              onChange={(event) => field.handleChange(event.target.value)}
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
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose
              render={<Button variant="outline" />}
              disabled={isSubmitting}
            >
              Annuler
            </DialogClose>
            <Button type="submit" disabled={!isHydrated || isSubmitting}>
              {isSubmitting
                ? 'Enregistrement…'
                : resource
                  ? 'Enregistrer les modifications'
                  : 'Créer la ressource'}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}
