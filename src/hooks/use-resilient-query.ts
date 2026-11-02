import { useQueries } from 'convex/react'
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import { ConvexError, convexToJson } from 'convex/values'
import { useEffect, useMemo, useState } from 'react'

import { useRetained } from './use-retained'

// AUD-28 : sous charge, le backend peut renvoyer une erreur serveur passagère
// (non typée) sur une query, et la souscription reste en erreur. Au lieu de
// remonter l'arbre (ce qui perdrait brouillons et réglages locaux), on garde
// la dernière valeur reçue et on se réabonne : retirer la souscription un
// rendu, puis la recréer, relance l'exécution côté serveur. Délai croissant,
// cinq essais au plus ; une ConvexError (droits, intégrité) reste définitive.
const TRANSIENT_RETRIES = 5

// useQueries renvoie `any` : la valeur d'une query réussie est tout ce qui
// n'est ni absent (chargement) ni une erreur.
function isResultOf<Query extends FunctionReference<'query'>>(
  value: unknown,
  _query: Query
): value is FunctionReturnType<Query> {
  return value !== undefined && !(value instanceof Error)
}

export function useResilientQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query>
): FunctionReturnType<Query> | undefined {
  const [attempt, setAttempt] = useState(0)
  const [paused, setPaused] = useState(false)
  // Les arguments n'ont pas d'identité stable d'un rendu à l'autre : on ne
  // change la souscription que si leur contenu change (comme useQuery).
  const key = JSON.stringify(convexToJson(args))
  const [stable, setStable] = useState({ key, args })
  if (stable.key !== key) setStable({ key, args })
  const request = useMemo(
    () => (paused ? {} : { value: { query, args: stable.args } }),
    [paused, query, stable]
  )
  const raw: unknown = useQueries(request).value
  const result = isResultOf(raw, query) ? raw : undefined
  const error = raw instanceof Error ? raw : null
  const transient = error !== null && !(error instanceof ConvexError)
  // Un résultat reçu clôt l'épisode d'erreur : le budget repart à zéro.
  if (result !== undefined && attempt !== 0) setAttempt(0)
  useEffect(() => {
    if (!transient || attempt >= TRANSIENT_RETRIES) return undefined
    const timer = setTimeout(
      () => {
        setAttempt((value) => value + 1)
        setPaused(true)
      },
      500 * 2 ** attempt
    )
    return () => clearTimeout(timer)
  }, [transient, attempt])
  // Un rendu sans la query la retire du client ; on la recrée ensuite.
  useEffect(() => {
    if (!paused) return undefined
    const timer = setTimeout(() => setPaused(false), 50)
    return () => clearTimeout(timer)
  }, [paused])
  const kept = useRetained(result)
  if (error && (!transient || attempt >= TRANSIENT_RETRIES)) throw error
  return kept
}
