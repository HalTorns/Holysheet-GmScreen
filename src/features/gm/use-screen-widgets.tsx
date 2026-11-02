import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { useQuery } from 'convex/react'

import { useRetained } from '@/hooks/use-retained'

// AUD-28 : une seule query réactive, complète et bornée par les budgets de
// l'ADR, remplace la pagination temps réel. useRetained garde la dernière
// liste pendant une ré-authentification (la query repasse à undefined).
export function useScreenWidgets(screenId: Id<'gmScreens'>) {
  return (
    useRetained(
      useQuery(api.gmWidgets.getScreenWidgetMetadata, { screenId })
    ) ?? []
  )
}
