import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Laptop, LogOut } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  formatAccountDate,
  sessionDeviceLabel,
} from '@/features/account/format'
import {
  authOperationError,
  operationErrorMessage,
} from '@/features/auth/errors'
import { authClient } from '@/lib/auth-client'

const sessionsQueryKey = ['account', 'sessions'] as const

export function SessionsSection() {
  const queryClient = useQueryClient()
  const sessions = useQuery({
    queryKey: sessionsQueryKey,
    queryFn: async () => {
      const [list, current] = await Promise.all([
        authClient.listSessions(),
        authClient.getSession(),
      ])
      if (list.error) throw authOperationError(list.error)
      if (current.error) throw authOperationError(current.error)
      return {
        items: list.data ?? [],
        currentToken: current.data?.session.token,
      }
    },
    retry: false,
    staleTime: 10_000,
  })
  const closeSession = useMutation({
    mutationFn: async (token: string) => {
      const result = await authClient.revokeSession({ token })
      if (result.error) throw authOperationError(result.error)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey })
      toast.success('Session fermée.')
    },
  })
  const closeOtherSessions = useMutation({
    mutationFn: async () => {
      const result = await authClient.revokeOtherSessions()
      if (result.error) throw authOperationError(result.error)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey })
      toast.success('Les autres sessions ont été fermées.')
    },
  })
  const error = sessions.error ?? closeSession.error ?? closeOtherSessions.error

  return (
    <section
      className="security-section panel"
      aria-labelledby="sessions-heading"
    >
      <div className="security-section-title">
        <div>
          <h2 id="sessions-heading">
            <Laptop aria-hidden="true" />
            Appareils connectés
          </h2>
          <p>
            Retrouvez vos sessions actives et fermez celles que vous ne
            reconnaissez pas.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={closeOtherSessions.isPending || sessions.isPending}
          onClick={() => closeOtherSessions.mutate()}
        >
          {closeOtherSessions.isPending
            ? 'Fermeture…'
            : 'Fermer les autres sessions'}
        </Button>
      </div>
      {sessions.isPending && (
        <p className="field-hint" role="status">
          Chargement des sessions…
        </p>
      )}
      {error && (
        <div className="mb-4 grid justify-items-start gap-3">
          <p className="field-error" role="alert">
            {operationErrorMessage(
              error,
              'Impossible de gérer vos sessions pour le moment.'
            )}
          </p>
          {sessions.isError && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void sessions.refetch()}
            >
              Réessayer
            </Button>
          )}
        </div>
      )}
      <div className="security-list">
        {sessions.data?.items.map((session) => {
          const isCurrent = session.token === sessions.data.currentToken
          return (
            <div className="security-row" key={session.id}>
              <div>
                <h3>
                  {sessionDeviceLabel(session.userAgent)}
                  {isCurrent && (
                    <span className="ml-2 rounded bg-secondary px-2 py-1 text-[10px] font-normal text-primary">
                      Cet appareil
                    </span>
                  )}
                </h3>
                <p>
                  Connexion le {formatAccountDate(session.createdAt)} · Expire
                  le {formatAccountDate(session.expiresAt)}
                </p>
              </div>
              {!isCurrent && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={closeSession.isPending}
                  onClick={() => closeSession.mutate(session.token)}
                  aria-label={`Fermer la session ${sessionDeviceLabel(session.userAgent)}`}
                >
                  <LogOut aria-hidden="true" />
                  Fermer
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
