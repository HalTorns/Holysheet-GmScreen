import { api } from '@convex/_generated/api'
import { useConvex, useQuery } from 'convex/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

export function SupportPanel() {
  const convex = useConvex()
  const access = useQuery(api.auth.getAccessState, {})
  const [id, setId] = useState('')
  const [target, setTarget] = useState<{
    id: string
    name: string
    email: string
  } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!access?.isAdmin)
    return <p>Accès réservé à l’administration de la plateforme.</p>
  async function find() {
    setPending(true)
    setError(null)
    setTarget(null)
    try {
      setTarget(await convex.query(api.authSecurity.findSupportUser, { id }))
    } catch {
      setError('Recherche refusée. Reconnectez-vous puis réessayez.')
    } finally {
      setPending(false)
    }
  }
  async function impersonate() {
    if (
      !target ||
      !window.confirm(
        `Ouvrir temporairement le compte de ${target.name} pour le support ?`
      )
    )
      return
    setPending(true)
    setError(null)
    try {
      const result = await authClient.admin.impersonateUser({
        userId: target.id,
      })
      if (result.error) {
        setError('Accès refusé. Une connexion récente est nécessaire.')
        return
      }
      window.location.assign('/app')
    } catch {
      setError('Accès temporaire indisponible.')
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="panel grid gap-5 p-8">
      <h1>Support de la plateforme</h1>
      <p>
        L’accès en lecture seule expire après cinq minutes et est enregistré.
        Pour toute modification, revenez à votre compte.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void find()
        }}
        className="grid gap-3"
      >
        <label htmlFor="support-user">Identifiant stable du compte</label>
        <Input
          id="support-user"
          value={id}
          onChange={(event) => setId(event.target.value)}
          maxLength={128}
          required
        />
        <Button disabled={pending} type="submit">
          Rechercher le compte
        </Button>
      </form>
      {target && (
        <div className="grid gap-3">
          <p>
            {target.name} · {target.email}
          </p>
          <Button
            disabled={pending}
            variant="outline"
            onClick={() => void impersonate()}
          >
            Ouvrir le compte pour le support
          </Button>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

export function ImpersonationBanner() {
  const access = useQuery(api.auth.getAccessState, {})
  const [error, setError] = useState<string | null>(null)
  if (!access?.isImpersonating) return null
  async function stop() {
    try {
      const result = await authClient.admin.stopImpersonating()
      if (result.error) {
        setError('Fermez cette session puis reconnectez-vous.')
        return
      }
      window.location.assign('/app')
    } catch {
      setError('Retour au compte indisponible.')
    }
  }
  return (
    <aside
      className="border-b bg-secondary p-4"
      aria-label="Session de support"
    >
      <p>Vous consultez temporairement un autre compte en lecture seule.</p>
      <Button variant="outline" onClick={() => void stop()}>
        Revenir à mon compte
      </Button>
      {error && <p role="alert">{error}</p>}
    </aside>
  )
}
