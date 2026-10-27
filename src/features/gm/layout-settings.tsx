import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { gmLayoutSize, gmTitle } from '@shared/gm'
import { z } from '@shared/zod'
import { useForm } from '@tanstack/react-form'
import { useMutation } from 'convex/react'
import { useRef, useState } from 'react'

import { FormTextField } from '@/components/form-text-field'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { operationErrorMessage } from '@/features/auth/errors'

export function LayoutSettings({
  layout,
  disabled,
  onApply,
  onCreated,
}: {
  layout: Doc<'gmLayouts'>
  disabled: boolean
  onApply: (
    settings: { name: string; width: number; height: number },
    version: number
  ) => void
  onCreated: (id: Id<'gmLayouts'>) => void
}) {
  const [dialog, setDialog] = useState<'settings' | 'profile' | null>(null)
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => setDialog('settings')}
      >
        Configurer le profil
      </Button>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => setDialog('profile')}
      >
        Nouveau profil
      </Button>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
      >
        <DialogContent>
          <DialogTitle>
            {dialog === 'profile'
              ? 'Nouveau profil de disposition'
              : 'Configurer le profil'}
          </DialogTitle>
          <DialogDescription>
            {dialog === 'profile'
              ? 'Copiez la disposition actuelle. Les contenus restent communs aux profils.'
              : 'Dimensions en pixels. Réduire la surface ne repositionne pas les notes ; utilisez leurs coordonnées pour les ramener dans le cadre.'}
          </DialogDescription>
          {dialog === 'settings' && (
            <SettingsForm
              layout={layout}
              onApply={(value, version) => {
                onApply(value, version)
                setDialog(null)
              }}
            />
          )}
          {dialog === 'profile' && (
            <ProfileForm
              sourceId={layout._id}
              onCreated={(id) => {
                onCreated(id)
                setDialog(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function SettingsForm({
  layout,
  onApply,
}: {
  layout: Doc<'gmLayouts'>
  onApply: (
    value: { name: string; width: number; height: number },
    version: number
  ) => void
}) {
  const version = useRef(layout.version)
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: {
      name: layout.name,
      width: layout.width,
      height: layout.height,
    },
    validators: { onSubmit: gmLayoutSize },
    onSubmit: ({ value }) => {
      if (version.current !== layout.version) {
        setError(
          'Ce profil a changé dans une autre vue. Fermez cette fenêtre puis rouvrez ses réglages.'
        )
        return
      }
      onApply(value, version.current)
    },
  })
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => (
          <FormTextField
            id="layout-name"
            label="Nom du profil"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
            isTouched={field.state.meta.isTouched}
            required
            maxLength={120}
          />
        )}
      </form.Field>
      {(['width', 'height'] as const).map((name) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <FormTextField
              id={`layout-${name}`}
              label={
                name === 'width'
                  ? 'Largeur du profil (px)'
                  : 'Hauteur du profil (px)'
              }
              type="number"
              min={name === 'width' ? 320 : 240}
              max={8192}
              value={field.state.value}
              onChange={(event) =>
                field.handleChange(Number(event.target.value))
              }
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
              isTouched={field.state.meta.isTouched}
              required
            />
          )}
        </form.Field>
      ))}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <Button type="submit">Appliquer les dimensions</Button>
    </form>
  )
}

function ProfileForm({
  sourceId,
  onCreated,
}: {
  sourceId: Id<'gmLayouts'>
  onCreated: (id: Id<'gmLayouts'>) => void
}) {
  const create = useMutation(api.gmEditor.createProfile)
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { name: '' },
    validators: { onSubmit: z.object({ name: gmTitle }) },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        onCreated(await create({ sourceId, name: value.name }))
      } catch (error) {
        setError(operationErrorMessage(error))
      }
    },
  })
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => (
          <FormTextField
            id="new-profile-name"
            label="Nom du nouveau profil"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
            isTouched={field.state.meta.isTouched}
            required
            maxLength={120}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <Button type="submit" disabled={pending}>
            {pending ? 'Création…' : 'Créer le profil'}
          </Button>
        )}
      </form.Subscribe>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </form>
  )
}
