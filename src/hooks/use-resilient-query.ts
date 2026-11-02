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
// cinq essais rapides, puis un essai toutes les 30 s tant qu'une valeur est
// affichée. Sans valeur, l'erreur remonte. Une ConvexError reste définitive.
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
  const [failed, setFailed] = useState(false)
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
  const kept = useRetained(result)
  // Un résultat reçu clôt l'épisode d'erreur : le budget repart à zéro.
  if (result !== undefined && (attempt !== 0 || failed)) {
    setAttempt(0)
    setFailed(false)
  }
  const hasValue = kept !== undefined
  useEffect(() => {
    if (!transient) return undefined
    // Après le dernier essai, une erreur lue tout de suite peut venir du cache
    // du client, avant la réponse du serveur : on n'abandonne qu'après un délai.
    if (attempt >= TRANSIENT_RETRIES && !hasValue) {
      const timer = setTimeout(() => setFailed(true), 2000)
      return () => clearTimeout(timer)
    }
    // Une valeur est déjà affichée (éditeurs et brouillons montés) : on ne lève
    // jamais l'erreur, on continue à réessayer lentement.
    const delay = attempt >= TRANSIENT_RETRIES ? 30_000 : 500 * 2 ** attempt
    const timer = setTimeout(() => {
      setAttempt((value) => Math.min(value + 1, TRANSIENT_RETRIES))
      setPaused(true)
    }, delay)
    return () => clearTimeout(timer)
  }, [transient, attempt, hasValue])
  // Un rendu sans la query la retire du client ; on la recrée ensuite.
  useEffect(() => {
    if (!paused) return undefined
    const timer = setTimeout(() => setPaused(false), 50)
    return () => clearTimeout(timer)
  }, [paused])
  if (error && !transient) throw error
  if (error && failed && !hasValue) throw error
  return kept
}
