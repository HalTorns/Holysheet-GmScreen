import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'

import { useResilientQuery } from '@/hooks/use-resilient-query'

// AUD-28 : une seule query réactive, complète et bornée par les budgets de
// l'ADR, remplace la pagination temps réel. useResilientQuery garde la
// dernière liste pendant une ré-authentification ou une erreur passagère.
export function useScreenWidgets(screenId: Id<'gmScreens'>) {
  return (
    useResilientQuery(api.gmWidgets.getScreenWidgetMetadata, { screenId }) ?? []
  )
}
