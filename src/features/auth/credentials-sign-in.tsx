import { emailSchema } from '@shared/validation'
import { z } from '@shared/zod'
import { useForm } from '@tanstack/react-form'
import { useHydrated } from '@tanstack/react-router'
import { useState } from 'react'

import { FormTextField } from '@/components/form-text-field'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export function CredentialsSignIn() {
  const isHydrated = useHydrated()
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { email: '', password: '' },
    validators: {
      onSubmit: z.object({
        email: emailSchema,
        password: z.string().min(1).max(128),
      }),
    },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        const result = await authClient.signIn.email(value)
        if (result.error) {
          setError(
            'Connexion refusée. Vérifiez vos identifiants puis réessayez.'
          )
          return
        }
        window.location.assign('/app')
      } catch {
        setError('Connexion indisponible. Réessayez.')
      }
    },
  })
  return (
    <form
      method="post"
      className="mt-5 grid gap-3"
      aria-label="Connexion avec mot de passe"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="email">
        {(field) => (
          <FormTextField
            id="credential-email"
            label="Email du compte avec mot de passe"
            type="email"
            autoComplete="username"
            disabled={!isHydrated}
            required
            name={field.name}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
            isTouched={field.state.meta.isTouched}
          />
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <FormTextField
            id="credential-password"
            label="Mot de passe"
            type="password"
            autoComplete="current-password"
            disabled={!isHydrated}
            required
            name={field.name}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
            isTouched={field.state.meta.isTouched}
          />
        )}
      </form.Field>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <Button
            variant="outline"
            type="submit"
            disabled={!isHydrated || pending}
          >
            Se connecter avec un mot de passe
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
