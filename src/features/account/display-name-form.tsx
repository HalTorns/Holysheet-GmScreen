import { api } from '@convex/_generated/api'
import { displayNameSchema } from '@shared/validation'
import { z } from '@shared/zod'
import { useForm, useSelector } from '@tanstack/react-form'
import { useHydrated } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DraftGuard } from '@/components/draft-guard'
import { FormError } from '@/components/form-error'
import { SaveActions } from '@/components/save-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { operationErrorMessage } from '@/features/auth/errors'

export function DisplayNameForm({
  name,
  profileVersion,
  onboarding = false,
  onSaved,
}: {
  name: string
  profileVersion: number
  onboarding?: boolean
  onSaved?: () => void
}) {
  const [version, setVersion] = useState(profileVersion)
  const hydrated = useHydrated()
  const save = useMutation(api.account.setDisplayName)
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { name: onboarding ? '' : name },
    validators: {
      onBlur: z.object({ name: displayNameSchema }),
      onSubmit: z.object({ name: displayNameSchema }),
    },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        const savedVersion = await save({
          name: displayNameSchema.parse(value.name),
          expectedVersion: version,
        })
        setVersion(savedVersion)
        form.reset({ name: displayNameSchema.parse(value.name) })
        toast.success('Pseudo enregistré.')
        onSaved?.()
      } catch (error) {
        setError(operationErrorMessage(error))
      }
    },
  })
  const pending = useSelector(form.store, (state) => state.isSubmitting)
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => (
          <div className="form-field">
            <label htmlFor="profile-name">Pseudo</label>
            <Input
              id="profile-name"
              autoComplete="nickname"
              value={field.state.value}
              maxLength={256}
              disabled={!hydrated || pending}
              onChange={(event) => {
                field.handleChange(event.target.value)
                setError(null)
              }}
              onBlur={field.handleBlur}
              aria-invalid={
                Boolean(error) ||
                (field.state.meta.isTouched && !field.state.meta.isValid)
              }
              aria-describedby="profile-name-hint profile-name-error"
              required
            />
            <p id="profile-name-hint" className="field-hint">
              De 2 à 32 caractères : lettres, chiffres, espaces, points, tirets
              et underscores.
            </p>
            <FormError
              id="profile-name-error"
              errors={field.state.meta.errors}
              isTouched={field.state.meta.isTouched}
            />
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </form.Field>
      {error && profileVersion !== version && (
        <div className="grid gap-3 rounded-md border p-4">
          <p>
            Pseudo actuel : <strong>{name}</strong>
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setVersion(profileVersion)
              setError(null)
            }}
          >
            Conserver ma saisie et reprendre sur cette version
          </Button>
        </div>
      )}
      <form.Subscribe
        selector={(state) => ({
          dirty: !state.isDefaultValue,
          pending: state.isSubmitting,
        })}
      >
        {({ dirty, pending }) => (
          <>
            <DraftGuard dirty={dirty} />
            <SaveActions
              pending={pending}
              disabled={!hydrated || pending}
              label={onboarding ? 'Continuer' : 'Enregistrer mon pseudo'}
            />
          </>
        )}
      </form.Subscribe>
    </form>
  )
}

export function ProfileOnboarding({
  name,
  profileVersion,
  hasName,
  onComplete,
}: {
  name: string
  profileVersion: number
  hasName: boolean
  onComplete: () => void
}) {
  return (
    <section
      className="panel mx-auto grid max-w-xl gap-5 p-6"
      aria-labelledby="onboarding-heading"
    >
      <h1 id="onboarding-heading" className="text-2xl font-semibold">
        Comment doit-on vous appeler ?
      </h1>
      <p>Choisissez votre pseudo. Vous pourrez le modifier dans Mon compte.</p>
      <DisplayNameForm
        name={name}
        profileVersion={profileVersion}
        onboarding
        onSaved={onComplete}
      />
      {hasName && (
        <div className="grid gap-3 rounded-md border p-4">
          <p>
            Un pseudo a été enregistré dans un autre onglet :{' '}
            <strong>{name}</strong>. Votre saisie est conservée.
          </p>
          <Button variant="outline" onClick={onComplete}>
            Utiliser le pseudo déjà enregistré
          </Button>
        </div>
      )}
    </section>
  )
}
