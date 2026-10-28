import type { FunctionReturnType } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

describe('Export des événements applicatifs (AUD-02)', () => {
  it("exporte les événements dont le compte est l'auteur, sans ceux d'un autre compte", async () => {
    const backend = createBackendTest()
    const alice = await createAuthenticatedUser(backend, 'alice@example.com')
    const bob = await createAuthenticatedUser(backend, 'bob@example.com')
    for (let index = 0; index < 3; index++)
      await alice.client.mutation(api.resources.create, {
        title: `Alice ${index}`,
        description: '',
      })
    await bob.client.mutation(api.resources.create, {
      title: 'Bob',
      description: '',
    })

    const events: { event: string; createdAt: number }[] = []
    let cursor: string | null = null
    let isDone = false
    while (!isDone) {
      const page: FunctionReturnType<
        typeof api.account.exportApplicationEvents
      > = await alice.client.query(api.account.exportApplicationEvents, {
        paginationOpts: { numItems: 2, cursor },
      })
      expect(page.page.length).toBeLessThanOrEqual(2)
      events.push(...page.page)
      isDone = page.isDone
      cursor = page.continueCursor
    }
    expect(events).toHaveLength(3)
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(['createdAt', 'event'])
      expect(event.event).toBe('resource.created')
    }

    const bobEvents = await bob.client.query(
      api.account.exportApplicationEvents,
      { paginationOpts: { numItems: 50, cursor: null } }
    )
    expect(bobEvents.page).toHaveLength(1)
  })

  it('refuse un appel sans session', async () => {
    const backend = createBackendTest()
    await expect(
      backend.query(api.account.exportApplicationEvents, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).rejects.toThrow()
  })
})
