import { ConvexProvider } from 'convex/react'
import type { ConvexReactClient } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'

import { useResilientQuery } from '../../src/hooks/use-resilient-query'

// Vrai useQueries de Convex, client factice. Comme `api.x.y` en production,
// chaque rendu passe une référence neuve à la même fonction.
let current: unknown
let watches = 0
const listeners = new Set<() => void>()
const fake = {
  watchQuery: () => {
    watches += 1
    return {
      onUpdate: (callback: () => void) => {
        listeners.add(callback)
        return () => listeners.delete(callback)
      },
      localQueryResult: () => current,
      journal: () => undefined,
    }
  },
}
function isClient(value: object): value is ConvexReactClient {
  return 'watchQuery' in value
}

function Probe() {
  const data = useResilientQuery(
    makeFunctionReference<'query', { id: string }, string>('probe:get'),
    { id: 'a' }
  )
  return <p>{data ?? 'Chargement'}</p>
}

test('a fresh api reference on every render does not loop', async () => {
  if (!isClient(fake)) throw new Error('fake client')
  current = undefined
  const screen = await render(
    <ConvexProvider client={fake}>
      <Probe />
    </ConvexProvider>
  )
  await expect.element(screen.getByText('Chargement')).toBeVisible()
  current = 'Écran'
  for (const listener of listeners) listener()
  await expect.element(screen.getByText('Écran')).toBeVisible()
  expect(watches).toBeLessThan(20)
})
