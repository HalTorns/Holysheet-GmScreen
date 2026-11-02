import { CatchBoundary } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { ConvexError } from 'convex/values'
import type { ComponentType, ReactNode } from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

// AUD-28 : sous charge, le backend peut renvoyer une erreur serveur passagère
// (non typée) sur une query. La souscription reste alors en erreur jusqu'au
// remontage : on réessaie automatiquement, avec un délai croissant et un
// plafond. Une ConvexError (droits, intégrité) est définitive.
const TRANSIENT_RETRIES = 5
const Recovered = createContext<() => void>(() => undefined)

// Un résultat reçu clôt l'épisode d'erreur : le budget de réessai repart à zéro.
export function useRecoveredWhen(loaded: unknown) {
  const recovered = useContext(Recovered)
  useEffect(() => {
    if (loaded) recovered()
  }, [loaded, recovered])
}

function RetryView({
  error,
  reset,
  attempts,
  onRetry,
  loading,
  Unavailable,
}: ErrorComponentProps & {
  attempts: number
  onRetry: (next: number) => void
  loading: ReactNode
  Unavailable: ComponentType<{ retry: () => void }>
}) {
  const automatic =
    !(error instanceof ConvexError) && attempts < TRANSIENT_RETRIES
  useEffect(() => {
    if (!automatic) return undefined
    const timer = setTimeout(
      () => {
        onRetry(attempts + 1)
        reset()
      },
      500 * 2 ** attempts
    )
    return () => clearTimeout(timer)
  }, [automatic, attempts, onRetry, reset])
  if (automatic) return loading
  return (
    <Unavailable
      retry={() => {
        onRetry(0)
        reset()
      }}
    />
  )
}

export function TransientRetryBoundary({
  resetKey,
  loading,
  unavailable,
  children,
}: {
  resetKey: string
  loading: ReactNode
  unavailable: ComponentType<{ retry: () => void }>
  children: ReactNode
}) {
  const [attempts, setAttempts] = useState(0)
  const recovered = useCallback(() => setAttempts(0), [])
  const errorComponent = useCallback(
    (props: ErrorComponentProps) => (
      <RetryView
        {...props}
        attempts={attempts}
        onRetry={setAttempts}
        loading={loading}
        Unavailable={unavailable}
      />
    ),
    [attempts, loading, unavailable]
  )
  return (
    <Recovered value={recovered}>
      <CatchBoundary
        getResetKey={() => resetKey}
        errorComponent={errorComponent}
      >
        {children}
      </CatchBoundary>
    </Recovered>
  )
}
