import { z } from '@shared/zod'
import { ConvexProviderWithAuth } from 'convex/react'
import type { ConvexReactClient } from 'convex/react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

import { authClient } from './auth-client'

const tokenSchema = z.object({ token: z.string().min(1) })
type TransportState = {
  unavailable: boolean
  dialogCount: number
  registerDialog: () => () => void
  setUnavailable: (value: boolean) => void
  initialToken: string | null
  retry: { current: (() => void) | null }
}
const TransportContext = createContext<TransportState | null>(null)

function useCookieAuth() {
  const transport = useContext(TransportContext)
  if (!transport) throw new Error('Authentication transport is missing')
  const session = authClient.useSession()
  const { initialToken, setUnavailable, retry } = transport
  const [token, setToken] = useState(initialToken)
  const cachedToken = useRef(initialToken)
  const generation = useRef(0)
  const sessionId = session.data?.session.id
  const denied = session.error?.status === 401 || session.error?.status === 403
  const absent =
    !session.isPending && !session.data && (!session.error || denied)
  // Cleanup runs before the next token fetch. Incrementing during setup
  // would cancel the fetch already started by Convex's child effect.
  useEffect(
    () => () => {
      generation.current += 1
      if (sessionId || absent) cachedToken.current = null
      retry.current?.()
    },
    // These identity keys intentionally invalidate the preceding fetch.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
    [sessionId, absent, retry]
  )
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!sessionId && absent) return null
      // Reuse only the request-scoped JWT supplied by SSR (or the latest token).
      // Convex explicitly requests a fresh read for renewal; session guards remain live.
      if (!forceRefreshToken && cachedToken.current) return cachedToken.current
      const requestedGeneration = generation.current
      let delay = 1000
      while (requestedGeneration === generation.current) {
        let response: Response | null = null
        try {
          response = await fetch('/api/auth/convex/token', {
            credentials: 'same-origin',
            signal: AbortSignal.timeout(10_000),
          })
        } catch {
          /* Network failures are retryable, never proof of logout. */
        }
        if (requestedGeneration !== generation.current) return null
        if (response?.status === 401 || response?.status === 403) {
          setUnavailable(false)
          cachedToken.current = null
          setToken(null)
          return null
        }
        if (response?.ok) {
          const parsed = tokenSchema.safeParse(
            await response.json().catch(() => null)
          )
          if (requestedGeneration !== generation.current) return null
          if (parsed.success) {
            setUnavailable(false)
            cachedToken.current = parsed.data.token
            setToken(parsed.data.token)
            return parsed.data.token
          }
        }
        setUnavailable(true)
        // Keep the refresh pending, preserving mounted forms. Backend guards still
        // check the live session on every read/write; there is no session cache.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            retry.current = null
            resolve()
          }, delay)
          retry.current = () => {
            clearTimeout(timer)
            retry.current = null
            resolve()
          }
        })
        delay = Math.min(delay * 2, 30_000)
      }
      return null
    },
    [sessionId, absent, setUnavailable, retry]
  )
  // Attendre la session Better Auth avant d'authentifier Convex : sa résolution
  // change l'identité de fetchAccessToken, et un premier cycle lancé avec le
  // seul jeton SSR était aussitôt relancé, désactivant la page une seconde fois.
  return {
    // Une lecture de session en échec ne bloque pas un jeton déjà valide.
    isLoading:
      session.isPending || (Boolean(session.error && !denied) && !token),
    isAuthenticated:
      !session.isPending && !absent && Boolean(session.data || token),
    fetchAccessToken,
  }
}

export function AppAuthProvider({
  children,
  client,
  initialToken,
}: {
  children: ReactNode
  client: ConvexReactClient
  initialToken: string | null
}) {
  const [unavailable, setUnavailable] = useState(false)
  const [dialogCount, setDialogCount] = useState(0)
  const registerDialog = useCallback(() => {
    setDialogCount((count) => count + 1)
    return () => setDialogCount((count) => count - 1)
  }, [])
  const retry = useRef<(() => void) | null>(null)
  const transport = useMemo(
    () => ({
      unavailable,
      setUnavailable,
      initialToken,
      retry,
      dialogCount,
      registerDialog,
    }),
    [unavailable, initialToken, dialogCount, registerDialog]
  )
  return (
    <TransportContext value={transport}>
      {/* Convex requires the hook itself as its public useAuth prop. */}
      {/* oxlint-disable-next-line react/hooks */}
      <ConvexProviderWithAuth client={client} useAuth={useCookieAuth}>
        <AuthConnectionNotice />
        {children}
      </ConvexProviderWithAuth>
    </TransportContext>
  )
}

export function AuthConnectionNotice({
  inDialog = false,
}: {
  inDialog?: boolean
}) {
  const transport = useContext(TransportContext)
  const registerDialog = transport?.registerDialog
  useEffect(
    () => (inDialog ? registerDialog?.() : undefined),
    [inDialog, registerDialog]
  )
  const session = authClient.useSession()
  const denied = session.error?.status === 401 || session.error?.status === 403
  if (
    !transport?.unavailable ||
    (!inDialog && transport.dialogCount > 0) ||
    denied ||
    (!session.isPending && !session.data && !session.error)
  )
    return null
  return (
    <div
      role="status"
      className="relative z-50 flex flex-wrap items-center justify-center gap-3 border-b bg-background p-3 text-sm"
    >
      Connexion momentanément indisponible. Votre saisie est conservée.
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          transport.retry.current?.()
          void authClient.getSession()
        }}
      >
        Réessayer la connexion
      </Button>
    </div>
  )
}
