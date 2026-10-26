import { emailSchema, otpSchema, displayNameSchema } from '@shared/validation'
import { z } from '@shared/zod'
import { useForm } from '@tanstack/react-form'
import { useHydrated } from '@tanstack/react-router'
import { useState } from 'react'

import { FormTextField } from '@/components/form-text-field'
import { Button } from '@/components/ui/button'
import { authErrorMessage } from '@/features/auth/errors'
import { authClient } from '@/lib/auth-client'

type Mode = 'sign-in' | 'sign-up' | 'verify' | 'reset' | 'reset-confirm'
const headings: Record<Mode, string> = {
  'sign-in': 'Retrouvez votre table.',
  'sign-up': 'Créez votre espace de MJ.',
  verify: 'Vérifiez votre adresse.',
  reset: 'Mot de passe oublié ?',
  'reset-confirm': 'Choisissez un nouveau mot de passe.',
}
const labels: Record<Mode, string> = {
  'sign-in': 'Se connecter',
  'sign-up': 'Créer mon compte',
  verify: 'Vérifier mon adresse',
  reset: 'Recevoir un code de récupération',
  'reset-confirm': 'Enregistrer le nouveau mot de passe',
}

export function PasswordAuth() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const hydrated = useHydrated()
  const hasPassword =
    mode === 'sign-in' || mode === 'sign-up' || mode === 'reset-confirm'
  const hasCode = mode === 'verify' || mode === 'reset-confirm'
  const form = useForm({
    defaultValues: { name: '', email: '', password: '', otp: '' },
    validators: {
      onSubmit: z.object({
        name: mode === 'sign-up' ? displayNameSchema : z.string(),
        email: emailSchema,
        password: hasPassword
          ? z
              .string()
              .min(mode === 'sign-in' ? 1 : 8)
              .max(128)
          : z.string(),
        otp: hasCode ? otpSchema : z.string(),
      }),
    },
    onSubmit: async ({ value }) => {
      setError(null)
      setNotice(null)
      try {
        if (mode === 'sign-in') {
          const result = await authClient.signIn.email({
            email: value.email,
            password: value.password,
          })
          if (result.error) {
            setError(
              'Connexion refusée. Vérifiez vos identifiants et la vérification de votre adresse.'
            )
            return
          }
          window.location.assign('/app')
        } else if (mode === 'sign-up') {
          const result = await authClient.signUp.email({
            name: value.name,
            email: value.email,
            password: value.password,
          })
          if (result.error) {
            setError(
              authErrorMessage(
                result.error.code,
                'Création impossible. Vérifiez les champs ou utilisez la récupération de mot de passe.'
              )
            )
            return
          }
          const sent = await authClient.emailOtp.sendVerificationOtp({
            email: value.email,
            type: 'email-verification',
          })
          form.setFieldValue('password', '')
          setMode('verify')
          if (sent.error) setError(authErrorMessage(sent.error.code))
          else
            setNotice(
              'Si cette adresse peut être vérifiée, un code vient de lui être envoyé.'
            )
        } else if (mode === 'verify') {
          const result = await authClient.emailOtp.verifyEmail({
            email: value.email,
            otp: value.otp,
          })
          if (result.error) {
            setError(authErrorMessage(result.error.code))
            return
          }
          form.setFieldValue('otp', '')
          setMode('sign-in')
          setNotice('Adresse vérifiée. Connectez-vous avec votre mot de passe.')
        } else if (mode === 'reset') {
          const result = await authClient.emailOtp.sendVerificationOtp({
            email: value.email,
            type: 'forget-password',
          })
          if (result.error) {
            setError(authErrorMessage(result.error.code))
            return
          }
          setMode('reset-confirm')
          setNotice(
            'Si un compte correspond à cette adresse, un code de récupération a été envoyé.'
          )
        } else {
          const result = await authClient.emailOtp.resetPassword({
            email: value.email,
            otp: value.otp,
            password: value.password,
          })
          if (result.error) {
            setError(authErrorMessage(result.error.code))
            return
          }
          form.setFieldValue('password', '')
          form.setFieldValue('otp', '')
          setMode('sign-in')
          setNotice('Votre mot de passe est modifié. Connectez-vous à nouveau.')
        }
      } catch {
        setError(
          'Le service est indisponible. Votre saisie est conservée ; réessayez.'
        )
      }
    },
  })
  function changeMode(next: Mode) {
    form.reset()
    setMode(next)
    setError(null)
    setNotice(null)
  }
  async function resend() {
    setError(null)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: form.state.values.email,
        type: 'email-verification',
      })
      if (result.error) setError(authErrorMessage(result.error.code))
      else
        setNotice(
          'Si cette adresse peut être vérifiée, un nouveau code lui a été envoyé.'
        )
    } catch {
      setError('Envoi indisponible. Réessayez.')
    }
  }
  return (
    <>
      <p className="eyebrow">HOLYSHEET GM SCREEN</p>
      <h1>{headings[mode]}</h1>
      <p className="auth-form-description">
        {hasCode
          ? 'Saisissez le code reçu par email. Il expire après cinq minutes.'
          : 'Vos campagnes, vos notes et vos références de partie dans votre espace personnel.'}
      </p>
      <form
        className="grid gap-4"
        method="post"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        {mode === 'sign-up' && (
          <form.Field name="name">
            {(field) => (
              <FormTextField
                id="signup-name"
                label="Pseudo"
                autoComplete="nickname"
                name={field.name}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                required
                errors={field.state.meta.errors}
                isTouched={field.state.meta.isTouched}
              />
            )}
          </form.Field>
        )}
        <form.Field name="email">
          {(field) => (
            <FormTextField
              id="auth-email"
              label="Adresse email"
              type="email"
              autoComplete="username"
              name={field.name}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              disabled={!hydrated}
              required
              errors={field.state.meta.errors}
              isTouched={field.state.meta.isTouched}
            />
          )}
        </form.Field>
        {hasPassword && (
          <form.Field name="password">
            {(field) => (
              <FormTextField
                id="auth-password"
                label={
                  mode === 'reset-confirm'
                    ? 'Nouveau mot de passe'
                    : 'Mot de passe'
                }
                type="password"
                autoComplete={
                  mode === 'sign-in' ? 'current-password' : 'new-password'
                }
                name={field.name}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                minLength={mode === 'sign-in' ? 1 : 8}
                maxLength={128}
                required
                errors={field.state.meta.errors}
                isTouched={field.state.meta.isTouched}
              />
            )}
          </form.Field>
        )}
        {hasCode && (
          <form.Field name="otp">
            {(field) => (
              <FormTextField
                id="auth-code"
                label="Code de vérification"
                autoComplete="one-time-code"
                inputMode="numeric"
                name={field.name}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                maxLength={6}
                required
                errors={field.state.meta.errors}
                isTouched={field.state.meta.isTouched}
              />
            )}
          </form.Field>
        )}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="field-hint">
            {notice}
          </p>
        )}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(pending) => (
            <Button type="submit" disabled={!hydrated || pending}>
              {pending ? 'Veuillez patienter…' : labels[mode]}
            </Button>
          )}
        </form.Subscribe>
      </form>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {mode === 'sign-in' ? (
          <>
            <Button variant="link" onClick={() => changeMode('sign-up')}>
              Créer un compte
            </Button>
            <Button variant="link" onClick={() => changeMode('reset')}>
              Mot de passe oublié
            </Button>
            <Button variant="link" onClick={() => changeMode('verify')}>
              Vérifier mon adresse email
            </Button>
          </>
        ) : (
          <Button variant="link" onClick={() => changeMode('sign-in')}>
            Retour à la connexion
          </Button>
        )}
        {mode === 'verify' && (
          <Button variant="link" onClick={() => void resend()}>
            Renvoyer un code
          </Button>
        )}
      </div>
    </>
  )
}
