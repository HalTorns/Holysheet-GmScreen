import { api } from '@convex/_generated/api'
import { useQuery } from 'convex/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

export function MfaSection() {
  const capabilities = useQuery(api.capabilities.get, {})
  const access = useQuery(api.auth.getAccessState, {})
  const [setup, setSetup] = useState<{
    totpURI: string
    backupCodes: string[]
  } | null>(null)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  if (!capabilities?.mfa || access?.isImpersonating) return null
  async function enable() {
    setPending(true)
    setMessage(null)
    try {
      const result = await authClient.twoFactor.enable({})
      if (result.error || !result.data) {
        setMessage('Activation refusée. Reconnectez-vous avant de réessayer.')
        return
      }
      setSetup({
        totpURI: result.data.totpURI,
        backupCodes: result.data.backupCodes,
      })
    } catch {
      setMessage('Activation indisponible.')
    } finally {
      setPending(false)
    }
  }
  async function confirm() {
    setPending(true)
    setMessage(null)
    try {
      const result = await authClient.twoFactor.verifyTotp({ code })
      if (result.error) {
        setMessage(
          'Code refusé. Vérifiez votre application d’authentification.'
        )
        return
      }
      setCode('')
      setSetup(null)
      window.location.reload()
    } catch {
      setMessage('Vérification indisponible.')
    } finally {
      setPending(false)
    }
  }
  async function disable() {
    if (
      !window.confirm(
        'Désactiver la vérification supplémentaire pour ce compte ?'
      )
    )
      return
    setPending(true)
    setMessage(null)
    try {
      const result = await authClient.twoFactor.disable({})
      if (result.error) {
        setMessage(
          'Désactivation refusée. Reconnectez-vous puis vérifiez votre second facteur.'
        )
        return
      }
      window.location.reload()
    } catch {
      setMessage('Désactivation indisponible.')
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="security-section panel" aria-labelledby="mfa-heading">
      <h2 id="mfa-heading">Vérification supplémentaire</h2>
      <p>
        Ajoutez un code TOTP indépendant de votre boîte email. Conservez les
        codes de récupération dans un emplacement privé.
      </p>
      {setup ? (
        <div className="mt-5 grid gap-4">
          <label htmlFor="totp-uri">
            Clé de configuration de l’authentificateur
          </label>
          <Input
            id="totp-uri"
            type="password"
            readOnly
            value={new URL(setup.totpURI).searchParams.get('secret') ?? ''}
            autoComplete="off"
          />
          <p className="field-hint">
            Dans votre application, choisissez « ajouter une clé manuellement »,
            collez cette clé puis sélectionnez un code basé sur le temps (TOTP).
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                .writeText(
                  new URL(setup.totpURI).searchParams.get('secret') ?? ''
                )
                .catch(() => setMessage('Copie refusée par le navigateur.'))
            }}
          >
            Copier la clé
          </Button>
          <details>
            <summary>Afficher mes codes de récupération</summary>
            <ul>
              {setup.backupCodes.map((backupCode) => (
                <li className="font-mono" key={backupCode}>
                  {backupCode}
                </li>
              ))}
            </ul>
          </details>
          <label htmlFor="enroll-code">Code d’authentification</label>
          <Input
            id="enroll-code"
            type="password"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="one-time-code"
          />
          <Button disabled={pending} onClick={() => void confirm()}>
            Confirmer l’activation
          </Button>
        </div>
      ) : (
        <Button
          className="mt-4"
          disabled={pending}
          onClick={() => void (access?.mfaEnabled ? disable() : enable())}
        >
          {access?.mfaEnabled ? 'Désactiver la MFA' : 'Activer la MFA'}
        </Button>
      )}
      {message && (
        <p role="alert" className="field-error mt-4">
          {message}
        </p>
      )}
    </section>
  )
}
