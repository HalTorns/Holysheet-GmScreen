import { useForm } from '@tanstack/react-form'
import { useHydrated } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Fingerprint, Mail } from 'lucide-react'
import { useState } from 'react'
import { z } from '@shared/zod'

import { emailSchema, otpSchema } from '@shared/validation'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { authErrorMessage } from '@/features/auth/errors'
import { authClient } from '@/lib/auth-client'

export function SignInForm() {
  const [email, setEmail] = useState<string | null>(null)
  return email ? (
    <VerifyCodeForm email={email} onBack={() => setEmail(null)} />
  ) : (
    <RequestCodeForm onSent={setEmail} />
  )
}

function RequestCodeForm({ onSent }: { onSent: (email: string) => void }) {
  const isHydrated = useHydrated()
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { email: '' },
    validators: { onSubmit: z.object({ email: emailSchema }) },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        const result = await authClient.emailOtp.sendVerificationOtp({
          email: value.email,
          type: 'sign-in',
        })
        if (result.error) {
          setError(authErrorMessage(result.error.code))
          return
        }
        onSent(value.email)
      } catch {
        setError(
          'Impossible d’envoyer le code. Vérifiez votre connexion et réessayez.',
        )
      }
    },
  })

  return (
    <>
      <p className="eyebrow">VOTRE ESPACE PERSONNEL</p>
      <h1>Bienvenue.</h1>
      <p className="auth-form-description">
        Recevez un code par e-mail pour vous connecter ou créer votre compte.
      </p>
      <form
        method="post"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
        className="grid gap-5"
      >
        <form.Field name="email">
          {(field) => (
            <div className="form-field">
              <label htmlFor="email">Adresse e-mail</label>
              <Input
                id="email"
                name={field.name}
                type="email"
                autoComplete="email"
                placeholder="vous@exemple.fr"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={
                  field.state.meta.isTouched && !field.state.meta.isValid
                }
                aria-describedby="email-error"
                required
                disabled={!isHydrated}
              />
              <FormError
                id="email-error"
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
            <Button
              type="submit"
              disabled={!isHydrated || isSubmitting}
              className="w-full"
            >
              {isSubmitting ? 'Envoi en cours…' : 'Recevoir un code'}
              <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </form.Subscribe>
      </form>
      <div className="auth-divider">ou, si vous en avez déjà une</div>
      <PasskeySignInButton />
      <p className="field-hint mt-6 text-center">
        Aucun mot de passe à retenir.
        <br />
        Votre adresse e-mail reste privée.
      </p>
    </>
  )
}

function VerifyCodeForm({
  email,
  onBack,
}: {
  email: string
  onBack: () => void
}) {
  const isHydrated = useHydrated()
  const [error, setError] = useState<string | null>(null)
  const [isResending, setIsResending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { otp: '' },
    validators: { onSubmit: z.object({ otp: otpSchema }) },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        const result = await authClient.signIn.emailOtp({
          email,
          otp: value.otp,
        })
        if (result.error) {
          setError(
            authErrorMessage(
              result.error.code,
              'Ce code est incorrect ou a expiré. Demandez un nouveau code.',
            ),
          )
          return
        }
        window.location.assign('/app')
      } catch {
        setError('Connexion impossible pour le moment. Réessayez.')
      }
    },
  })

  async function resendCode() {
    setIsResending(true)
    setError(null)
    setNotice(null)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'sign-in',
      })
      if (result.error) {
        setError(authErrorMessage(result.error.code))
        return
      }
      setNotice('Un nouveau code a été envoyé.')
    } catch {
      setError('Impossible d’envoyer le code. Réessayez.')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-6 -ml-3">
        <ArrowLeft aria-hidden="true" />
        Changer d’adresse
      </Button>
      <p className="eyebrow">
        <Mail className="size-3.5" aria-hidden="true" />
        VÉRIFIEZ VOTRE BOÎTE MAIL
      </p>
      <h1>Un code, et c’est tout.</h1>
      <p className="auth-form-description">
        Saisissez le code à 6 chiffres envoyé à{' '}
        <strong className="font-medium text-foreground">{email}</strong>.
      </p>
      <form
        method="post"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
        className="grid gap-5"
      >
        <form.Field name="otp">
          {(field) => (
            <div className="form-field">
              <label htmlFor="otp">Code de vérification</label>
              <Input
                id="otp"
                name={field.name}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                className="h-14 text-center text-xl tracking-[0.35em]"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={
                  field.state.meta.isTouched && !field.state.meta.isValid
                }
                aria-describedby="otp-error"
                required
                disabled={!isHydrated}
              />
              <FormError
                id="otp-error"
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
        {notice && (
          <p className="field-hint" role="status">
            {notice}
          </p>
        )}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              disabled={!isHydrated || isSubmitting}
              className="w-full"
            >
              {isSubmitting ? 'Connexion en cours…' : 'Se connecter'}
              <ArrowRight aria-hidden="true" />
            </Button>
          )}
        </form.Subscribe>
      </form>
      <p className="field-hint mt-6 text-center">
        Pas de code reçu ? Vérifiez les courriers indésirables.
      </p>
      <Button
        variant="link"
        className="mt-1 w-full"
        onClick={() => void resendCode()}
        disabled={isResending}
      >
        {isResending ? 'Envoi en cours…' : 'Renvoyer un code'}
      </Button>
    </>
  )
}

function PasskeySignInButton() {
  const isHydrated = useHydrated()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signInWithPasskey() {
    setIsPending(true)
    setError(null)
    try {
      const result = await authClient.signIn.passkey({ autoFill: false })
      if (result?.error) {
        setError(
          authErrorMessage(
            'code' in result.error ? result.error.code : undefined,
            'La connexion a été annulée ou aucune passkey n’est disponible sur cet appareil.',
          ),
        )
        return
      }
      if (!result?.data) {
        setError(
          'La connexion a été annulée ou aucune passkey n’est disponible sur cet appareil.',
        )
        return
      }
      window.location.assign('/app')
    } catch {
      setError(
        'Impossible d’utiliser cette passkey. Vous pouvez recevoir un code par e-mail.',
      )
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="grid gap-3">
      <Button
        variant="outline"
        className="w-full"
        disabled={!isHydrated || isPending}
        onClick={() => void signInWithPasskey()}
      >
        <Fingerprint aria-hidden="true" />
        {isPending ? 'Vérification en cours…' : 'Se connecter avec une passkey'}
      </Button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
