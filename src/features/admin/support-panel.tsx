import { api } from '@convex/_generated/api'
import { useConvex, useQuery } from 'convex/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
  if (!access?.isSupport)
    return <p>Accès réservé aux opérateurs de support autorisés.</p>
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
  return (
    <section className="panel grid gap-5 p-8">
      <h1>Support de la plateforme</h1>
      <p>Recherche réservée aux opérateurs autorisés.</p>
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
