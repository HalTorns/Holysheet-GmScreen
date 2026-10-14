import type { api } from '@convex/_generated/api'
import { emailSchema } from '@shared/validation'
import { z } from '@shared/zod'
import { useForm } from '@tanstack/react-form'
import type { FunctionReturnType } from 'convex/server'
import { useState } from 'react'

import { FormTextField } from '@/components/form-text-field'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export type LoginCapabilities = FunctionReturnType<typeof api.capabilities.get>

export function OptionalSignIn({
  capabilities,
}: {
  capabilities: LoginCapabilities
}) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { email: '' },
    validators: {
      onBlur: z.object({ email: emailSchema }),
      onSubmit: z.object({ email: emailSchema }),
    },
    onSubmit: async ({ value }) => {
      setPending(true)
      setMessage(null)
      try {
        const result = await authClient.signIn.magicLink({
          email: emailSchema.parse(value.email),
          callbackURL: '/app',
        })
        setMessage(
          result.error
            ? 'Envoi refusé. Attendez avant de réessayer.'
            : 'Consultez votre boîte email pour ouvrir le lien de connexion.'
        )
      } catch {
        setMessage('Envoi indisponible.')
      } finally {
        setPending(false)
      }
    },
  })
  if (!capabilities.magicLink && !capabilities.socialProviders.length)
    return null
  async function signInSocial(
    provider: LoginCapabilities['socialProviders'][number]
  ) {
    setPending(true)
    setMessage(null)
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: '/app',
      })
      if (result.error)
        setMessage(
          'Connexion indisponible. Réessayez ou utilisez une autre méthode.'
        )
    } catch {
      setMessage(
        'Connexion indisponible. Réessayez ou utilisez une autre méthode.'
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <section
      className="mt-5 grid gap-3"
      aria-label="Autres méthodes de connexion"
    >
      {capabilities?.socialProviders.map((provider) => (
        <Button
          key={provider}
          variant="outline"
          disabled={pending}
          onClick={() => void signInSocial(provider)}
        >
          Continuer avec {provider === 'google' ? 'Google' : 'GitHub'}
        </Button>
      ))}
      {capabilities?.magicLink && (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="email">
            {(field) => (
              <FormTextField
                label="Email pour recevoir un lien"
                id="magic-email"
                type="email"
                required
                name={field.name}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
                isTouched={field.state.meta.isTouched}
                autoComplete="email"
                disabled={pending}
              />
            )}
          </form.Field>
          <Button variant="outline" type="submit" disabled={pending}>
            Recevoir un lien de connexion
          </Button>
        </form>
      )}
      {message && (
        <p role="status" className="field-hint">
          {message}
        </p>
      )}
    </section>
  )
}
