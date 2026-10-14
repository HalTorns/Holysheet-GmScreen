import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { api, components } from '../../convex/_generated/api'
import { RECENT_AUTH_MAX_AGE_SECONDS } from '../../shared/validation'
import {
  createAuthenticatedUser,
  createBackendTest,
  createPasskey,
} from './fixtures'

afterEach(() => vi.useRealTimers())

describe('Protected account lifecycle', () => {
  it("exports only the caller's data and requires recent authentication for export, account and passkey deletion", async () => {
    vi.useFakeTimers()
    const backend = createBackendTest()
    const alice = await createAuthenticatedUser(backend, 'alice@example.com')
    const bob = await createAuthenticatedUser(backend, 'bob@example.com')
    await alice.client.mutation(api.resources.create, {
      title: 'Alice private',
      description: 'A',
    })
    await bob.client.mutation(api.resources.create, {
      title: 'Bob private',
      description: 'B',
    })
    const keyId = await createPasskey(backend, alice.userId)
    const exported = await alice.client.query(api.account.exportData, {
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(exported.profile).toMatchObject({
      id: alice.userId,
      email: 'alice@example.com',
    })
    expect(exported.resources.page.map((resource) => resource.title)).toEqual([
      'Alice private',
    ])
    vi.advanceTimersByTime(RECENT_AUTH_MAX_AGE_SECONDS * 1000)
    await expect(
      alice.client.query(api.account.exportData, {
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).rejects.toThrow('REAUTHENTICATION_REQUIRED')
    await expect(
      alice.client.mutation(api.account.deleteAccount, {
        confirmation: 'DELETE',
      })
    ).rejects.toThrow('REAUTHENTICATION_REQUIRED')
    await expect(
      alice.client.mutation(api.account.removePasskey, { id: keyId })
    ).rejects.toThrow('REAUTHENTICATION_REQUIRED')
    expect(
      await alice.client.query(api.resources.list, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).toMatchObject({ page: [{ title: 'Alice private' }] })
  })

  it("protects the last passkey and rejects deleting another account's credential", async () => {
    const backend = createBackendTest()
    const alice = await createAuthenticatedUser(backend, 'alice@example.com')
    const bob = await createAuthenticatedUser(backend, 'bob@example.com')
    const firstKey = await createPasskey(backend, alice.userId)
    await expect(
      bob.client.mutation(api.account.removePasskey, { id: firstKey })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      alice.client.mutation(api.account.removePasskey, { id: firstKey })
    ).rejects.toThrow('LAST_PASSKEY')
    const secondKey = await createPasskey(backend, alice.userId)
    const removals = await Promise.allSettled([
      alice.client.mutation(api.account.removePasskey, { id: firstKey }),
      alice.client.mutation(api.account.removePasskey, { id: secondKey }),
    ])
    expect(
      removals.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1)
    expect(
      removals.filter((result) => result.status === 'rejected')
    ).toHaveLength(1)
    const remainingKeys: unknown = await backend.query(
      components.betterAuth.adapter.findMany,
      {
        model: 'passkey',
        where: [{ field: 'userId', value: alice.userId }],
        paginationOpts: { numItems: 10, cursor: null },
      }
    )
    expect(
      z.object({ page: z.array(z.unknown()) }).parse(remainingKeys).page
    ).toHaveLength(1)
  })

  it('invalidates sessions immediately and cleans all owned data in bounded batches without touching another account', async () => {
    vi.useFakeTimers()
    const backend = createBackendTest()
    const alice = await createAuthenticatedUser(backend, 'alice@example.com')
    const bob = await createAuthenticatedUser(backend, 'bob@example.com')
    const aliceKey = await createPasskey(backend, alice.userId)
    await backend.run(async (ctx) => {
      for (let index = 0; index < 205; index++) {
        await ctx.db.insert('resources', {
          ownerId: alice.userId,
          title: `Alice ${index}`,
          description: '',
          updatedAt: Date.now(),
        })
      }
    })
    const bobResource = await bob.client.mutation(api.resources.create, {
      title: 'Bob stays',
      description: '',
    })
    await alice.client.mutation(api.account.deleteAccount, {
      confirmation: 'DELETE',
    })
    expect(await alice.client.query(api.auth.getCurrentUser, {})).toBeNull()
    await expect(
      alice.client.query(api.resources.list, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).rejects.toThrow()
    await backend.finishAllScheduledFunctions(vi.runAllTimers)
    expect(
      await backend.run((ctx) =>
        ctx.db
          .query('resources')
          .withIndex('by_owner', (index) => index.eq('ownerId', alice.userId))
          .collect()
      )
    ).toEqual([])
    for (const [model, id] of [
      ['session', alice.sessionId],
      ['passkey', aliceKey],
    ] as const) {
      expect(
        await backend.query(components.betterAuth.adapter.findOne, {
          model,
          where: [{ field: '_id', value: id }],
        })
      ).toBeNull()
    }
    expect(
      await bob.client.query(api.resources.get, { id: bobResource })
    ).toMatchObject({ title: 'Bob stays' })
  })
})
