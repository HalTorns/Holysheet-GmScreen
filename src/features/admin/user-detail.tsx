import { convexQuery } from '@convex-dev/react-query'
import { api } from '@convex/_generated/api'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useConvexAuth } from 'convex/react'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { useState } from 'react'

import { DraftGuard } from '@/components/draft-guard'
import { FormDialogContent as DialogContent } from '@/components/form-dialog-content'
import { ListNavigation } from '@/components/list-navigation'
import { LoadingState } from '@/components/page-state'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  formatAccountDate,
  sessionDeviceLabel,
} from '@/features/account/format'
import { operationErrorMessage } from '@/features/auth/errors'

type ManagedUser = FunctionReturnType<typeof api.userAdmin.read>
type Change = FunctionArgs<typeof api.userAdmin.apply>['change']
export function AdminUser({ userId }: { userId: string }) {
  const { isLoading } = useConvexAuth()
  const access = useQuery(api.auth.getAccessState, {})
  if (!access && !isLoading) return <LoadingState />
  if (access && !access.isAdmin)
    return <p role="alert">Votre rôle ne permet pas cette action.</p>
  return <UserDetails key={userId} userId={userId} />
}
function UserDetails({ userId }: { userId: string }) {
  const { data: user } = useSuspenseQuery(
    convexQuery(api.userAdmin.read, { targetId: userId })
  )
  const current = useQuery(api.auth.getCurrentUser, {})
  if (!user) return <LoadingState />
  return (
    <>
      <Link to="/app/users" className="text-primary underline">
        ← Tous les utilisateurs
      </Link>
      <header className="my-6">
        <h1 className="text-2xl font-semibold">
          {user.name || 'Pseudo à choisir'}
        </h1>
        <p className="break-all">{user.email}</p>
        <p>
          Inscrit le {formatAccountDate(user.createdAt)} · Email{' '}
          {user.emailVerified ? 'vérifié' : 'non vérifié'} ·{' '}
          {user.banned ? 'Suspendu' : 'Actif'}
        </p>
      </header>
      <UserControls user={user} isSelf={current?.id === userId} />
      <UserAudit userId={userId} />
    </>
  )
}
function UserControls({
  user,
  isSelf,
}: {
  user: ManagedUser
  isSelf: boolean
}) {
  const apply = useMutation(api.userAdmin.apply)
  const [role, setRole] = useState(user.role)
  const [savedRole, setSavedRole] = useState(user.role)
  const [version, setVersion] = useState(user.adminVersion)
  const [reason, setReason] = useState('')
  const [days, setDays] = useState('7')
  const [confirmation, setConfirmation] = useState<{
    change: Change
    version: number
  } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  function confirm(change: Change) {
    setError(null)
    setMessage('')
    setConfirmation({ change, version })
  }
  async function commit() {
    if (!confirmation || pending) return
    setPending(true)
    try {
      const result = await apply({
        targetId: user.id,
        expectedVersion: confirmation.version,
        change: confirmation.change,
      })
      setVersion(result.adminVersion)
      setSavedRole(result.role)
      setRole(result.role)
      setConfirmation(null)
      setReason('')
      setDays('7')
      setMessage('Compte mis à jour.')
    } catch (error) {
      setError(operationErrorMessage(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      <DraftGuard
        dirty={Boolean(reason.trim()) || role !== savedRole || days !== '7'}
      />
      {user.adminVersion !== version && (
        <div className="my-4 grid gap-3 rounded-md border p-4">
          <p>
            Ce compte a changé ailleurs. Rôle actuel :{' '}
            {user.role === 'admin' ? 'Administrateur' : 'Utilisateur'} ; statut
            : {user.banned ? 'Suspendu' : 'Actif'}. Votre brouillon est
            conservé.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setVersion(user.adminVersion)
              setError(null)
              setConfirmation(null)
            }}
          >
            Reprendre le brouillon sur cette version
          </Button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={pending} className="grid gap-5 md:grid-cols-2">
        <form
          className="panel grid content-start gap-4 p-5"
          onSubmit={(event) => {
            event.preventDefault()
            confirm({ kind: 'role', role })
          }}
        >
          <h2 className="font-semibold">Rôle applicatif</h2>
          <p>
            Les droits d’organisation et de support technique restent distincts.
          </p>
          <label htmlFor="user-role">Rôle du compte</label>
          <select
            id="user-role"
            className="rounded-md border bg-background p-2"
            value={role}
            onChange={(event) =>
              setRole(event.target.value === 'admin' ? 'admin' : 'user')
            }
          >
            <option value="user">Utilisateur</option>
            <option value="admin">Administrateur</option>
          </select>
          <Button type="submit" disabled={role === user.role}>
            Modifier le rôle
          </Button>
        </form>
        <section className="panel grid gap-4 p-5">
          <h2 className="font-semibold">Accès à l’application</h2>
          {user.banned ? (
            <>
              <p>{user.banReason}</p>
              <p>
                {user.banExpires
                  ? `Jusqu’au ${formatAccountDate(user.banExpires)}`
                  : 'Sans date de fin'}
              </p>
              <Button onClick={() => confirm({ kind: 'unban' })}>
                Réactiver le compte
              </Button>
            </>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                confirm({
                  kind: 'ban',
                  reason,
                  days:
                    days === 'permanent'
                      ? null
                      : days === '1'
                        ? 1
                        : days === '30'
                          ? 30
                          : 7,
                })
              }}
            >
              <label htmlFor="ban-reason">Motif de suspension</label>
              <Input
                id="ban-reason"
                value={reason}
                required
                maxLength={1000}
                disabled={isSelf}
                onChange={(event) => setReason(event.target.value)}
              />
              <label htmlFor="ban-duration">Durée de suspension</label>
              <select
                id="ban-duration"
                className="rounded-md border bg-background p-2"
                value={days}
                disabled={isSelf}
                onChange={(event) => setDays(event.target.value)}
              >
                <option value="1">24 heures</option>
                <option value="7">7 jours</option>
                <option value="30">30 jours</option>
                <option value="permanent">Sans date de fin</option>
              </select>
              <Button
                type="submit"
                variant="destructive"
                disabled={isSelf || !reason.trim()}
              >
                Suspendre le compte
              </Button>
            </form>
          )}
        </section>
      </fieldset>
      <UserSessions
        userId={user.id}
        isSelf={isSelf}
        onRevoke={() => confirm({ kind: 'revoke' })}
      />
      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmation(null)
        }}
      >
        <DialogContent showCloseButton={!pending}>
          <DialogTitle>Confirmer la modification</DialogTitle>
          <DialogDescription>
            {confirmation
              ? changeDescription(confirmation.change, user.email)
              : ''}
          </DialogDescription>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmation(null)}
            >
              Annuler
            </Button>
            <Button disabled={pending} onClick={() => void commit()}>
              {pending ? 'Modification…' : 'Confirmer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
function changeDescription(change: Change, email: string) {
  if (change.kind === 'role')
    return `${email} aura le rôle ${change.role === 'admin' ? 'Administrateur' : 'Utilisateur'}. Les droits changent immédiatement.`
  if (change.kind === 'ban')
    return `Suspendre ${email} ${change.days === null ? 'sans échéance' : `pendant ${change.days} jours`} et fermer ses sessions. Motif : ${change.reason}`
  if (change.kind === 'unban')
    return `Réactiver ${email}. Les sessions révoquées resteront invalides.`
  return `Fermer toutes les sessions de ${email}. Une nouvelle connexion sera nécessaire.`
}
function UserSessions({
  userId,
  isSelf,
  onRevoke,
}: {
  userId: string
  isSelf: boolean
  onRevoke: () => void
}) {
  const sessions = useQuery(api.userAdmin.sessions, { targetId: userId })
  return (
    <section className="panel my-5 grid gap-4 p-5">
      <h2 className="font-semibold">Sessions actives</h2>
      {isSelf ? (
        <Link to="/app/security" className="text-primary underline">
          Gérer mes appareils dans Mon compte
        </Link>
      ) : (
        <Button variant="outline" onClick={onRevoke}>
          Fermer toutes les sessions
        </Button>
      )}
      {sessions ? (
        sessions.page.length === 0 ? (
          <p>
            {sessions.hasMore
              ? 'Aucune session active dans cet aperçu.'
              : 'Aucune session active.'}
          </p>
        ) : (
          sessions.page.map((session) => (
            <div key={session.id} className="border-t pt-3">
              <strong>
                {sessionDeviceLabel(session.userAgent ?? undefined)}
              </strong>
              <p>
                Connexion le {formatAccountDate(session.createdAt)} · Expire le{' '}
                {formatAccountDate(session.expiresAt)}
              </p>
            </div>
          ))
        )
      ) : (
        <LoadingState />
      )}
      {sessions?.hasMore && (
        <p>
          Aperçu limité à 20 sessions actives parmi les 100 connexions non
          révoquées les plus récentes. D’autres sessions peuvent exister. La
          fermeture concerne toutes les sessions.
        </p>
      )}
    </section>
  )
}
const auditLabels: Record<string, string> = {
  'mfa.verified': 'Vérification supplémentaire réussie',
  'admin.impersonated': 'Accès de support ouvert',
  'admin.role.granted': 'Rôle administrateur attribué',
  'admin.role.removed': 'Rôle administrateur retiré',
  'admin.user.suspended': 'Compte suspendu',
  'admin.user.restored': 'Compte réactivé',
  'admin.sessions.revoked': 'Toutes les sessions révoquées',
  'operator.admin.granted': 'Rôle administrateur attribué par un opérateur',
}
function UserAudit({ userId }: { userId: string }) {
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const audit = useQuery(api.userAdmin.audit, {
    targetId: userId,
    paginationOpts: { numItems: 20, cursor: cursors.at(-1) ?? null },
  })
  return (
    <section className="panel grid gap-3 p-5">
      <h2 className="font-semibold">Journal des actions</h2>
      <ListNavigation
        page={cursors.length}
        pending={!audit}
        {...(cursors.length > 1
          ? { previous: () => setCursors((value) => value.slice(0, -1)) }
          : {})}
        {...(audit && !audit.isDone
          ? {
              next: () =>
                setCursors((value) => [...value, audit.continueCursor]),
            }
          : {})}
      />
      {audit ? (
        audit.page.length === 0 ? (
          <p>Aucune action enregistrée.</p>
        ) : (
          audit.page.map((event, index) => (
            <p key={`${event.createdAt}:${index}`}>
              {auditLabels[event.event] ?? 'Action de sécurité'} ·{' '}
              {formatAccountDate(event.createdAt)}
              <span className="block text-sm break-all text-muted-foreground">
                Par{' '}
                {event.actorId === 'operator' ? 'un opérateur' : event.actorId}
              </span>
            </p>
          ))
        )
      ) : (
        <LoadingState />
      )}
    </section>
  )
}
