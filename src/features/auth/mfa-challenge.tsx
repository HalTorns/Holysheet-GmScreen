import { z } from '@shared/zod'
import { useForm } from '@tanstack/react-form'
import { useState } from 'react'

import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

export function MfaChallenge() {
  const [backup, setBackup] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  async function cancel() {
    setCancelling(true)
    setError(null)
    try {
      const result = await authClient.$fetch<{ restored: boolean }>(
        '/pending-sign-in/cancel',
        { method: 'POST', body: {} }
      )
      if (result.error || !result.data) {
        setError('Annulation indisponible. Réessayez.')
        return
      }
      window.location.assign(result.data.restored ? '/app' : '/sign-in')
    } catch {
      setError('Annulation indisponible. Réessayez.')
    } finally {
      setCancelling(false)
    }
  }
  const form = useForm({
    defaultValues: { code: '' },
    validators: {
      onSubmit: z.object({
        code: z.string().min(1, 'Saisissez votre code.').max(128),
      }),
    },
    onSubmit: async ({ value }) => {
      if (cancelling) return
      setError(null)
      try {
        const result = backup
          ? await authClient.twoFactor.verifyBackupCode({ code: value.code })
          : await authClient.twoFactor.verifyTotp({ code: value.code })
        if (result.error) {
          setError(
            'Code refusé ou limite atteinte. Vérifiez le code puis réessayez.'
          )
          return
        }
        window.location.assign('/app')
      } catch {
        setError('Vérification indisponible. Réessayez.')
      }
    },
  })
  return (
    <section className="panel mx-auto grid max-w-lg gap-5 p-8">
      <h1>Vérification supplémentaire</h1>
      <p>
        {backup
          ? 'Utilisez un code de récupération à usage unique.'
          : 'Saisissez le code de votre application d’authentification.'}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
        className="grid gap-4"
      >
        <form.Field name="code">
          {(field) => (
            <div className="form-field">
              <label htmlFor="mfa-code">
                {backup ? 'Code de récupération' : 'Code d’authentification'}
              </label>
              <Input
                id="mfa-code"
                type="password"
                disabled={cancelling}
                autoComplete="one-time-code"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-describedby="mfa-error"
              />
              <FormError
                id="mfa-error"
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
            <Button disabled={pending || cancelling} type="submit">
              {pending ? 'Vérification…' : 'Vérifier le code'}
            </Button>
          )}
        </form.Subscribe>
      </form>
      <Button
        variant="ghost"
        disabled={cancelling}
        onClick={() => {
          form.reset()
          setError(null)
          setBackup(!backup)
        }}
      >
        {backup
          ? 'Utiliser mon application'
          : 'Utiliser un code de récupération'}
      </Button>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <Button
            variant="outline"
            disabled={pending || cancelling}
            onClick={() => void cancel()}
          >
            {cancelling
              ? 'Annulation…'
              : 'Annuler cette tentative de connexion'}
          </Button>
        )}
      </form.Subscribe>
    </section>
  )
}
