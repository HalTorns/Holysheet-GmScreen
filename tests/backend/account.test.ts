import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { api, components } from '../../convex/_generated/api'
import {
  limitAuthEmail,
  limitAuthRequest,
  limitUserOperation,
} from '../../convex/lib/rateLimits'
import {
  confirmOperation,
  createAuthenticatedUser,
  createBackendTest,
  createPasskey,
} from './fixtures'

afterEach(() => vi.useRealTimers())

describe('Protected account lifecycle', () => {
  it("exports only the caller's data and allows ordinary operations after an hour and requires operation-bound proofs for sensitive changes", async () => {
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
    vi.advanceTimersByTime(3_500_000)
    expect(
      (
        await alice.client.query(api.account.exportData, {
          paginationOpts: { numItems: 50, cursor: null },
        })
      ).profile.id
    ).toBe(alice.userId)
    await alice.client.mutation(api.account.setDisplayName, {
      expectedVersion:
        (await alice.client.query(api.auth.getCurrentUser, {}))
          ?.profileVersion ?? 0,
      name: 'Alice updated',
    })
    await expect(
      alice.client.mutation(api.account.deleteAccount, {
        confirmation: 'DELETE',
      })
    ).rejects.toThrow('IDENTITY_CONFIRMATION_REQUIRED')
    await expect(
      alice.client.mutation(api.account.removePasskey, { id: keyId })
    ).rejects.toThrow('IDENTITY_CONFIRMATION_REQUIRED')
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
    await confirmOperation(backend, bob, `passkey.remove:${firstKey}`)
    await expect(
      bob.client.mutation(api.account.removePasskey, { id: firstKey })
    ).rejects.toThrow('NOT_FOUND')
    await confirmOperation(backend, alice, `passkey.remove:${firstKey}`)
    await expect(
      alice.client.mutation(api.account.removePasskey, { id: firstKey })
    ).rejects.toThrow('LAST_PASSKEY')
    const secondKey = await createPasskey(backend, alice.userId)
    await confirmOperation(backend, alice, `passkey.remove:${secondKey}`)
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
    const userOperations = [
      'resourceWrite',
      'accountSensitive',
      'organizationWrite',
      'mfaVerification',
      'identityVerification',
      'identityEmail',
    ] as const
    const authOperations = [
      'authSessionRead',
      'authTokenRead',
      'authEntry',
      'authOther',
    ] as const
    const buckets = [
      ...userOperations.map((name) => ({ name, key: alice.userId })),
      ...authOperations.map((name) => ({ name, key: `user:${alice.userId}` })),
    ]
    const readBucket = (name: string, key: string) =>
      backend.query(components.rateLimiter.lib.getValue, {
        name,
        key,
        config: { kind: 'token bucket', rate: 1, period: 60_000 },
      })
    await backend.run(async (ctx) => {
      for (const user of [alice, bob]) {
        for (const operation of userOperations)
          await limitUserOperation(ctx, operation, user.userId)
        for (const operation of authOperations)
          await limitAuthRequest(ctx, operation, `user:${user.userId}`)
      }
      await limitAuthRequest(ctx, 'authEntry', 'anonymous')
      await limitAuthEmail(ctx, 'alice@example.com')
    })
    const retainedBuckets = [
      { name: 'authTokenRead', key: `user:${bob.userId}` },
      { name: 'identityVerification', key: bob.userId },
      { name: 'authEntry', key: 'anonymous' },
      { name: 'authEmailGlobal', key: 'all' },
      {
        name: 'authEmailRecipient',
        key: Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode('alice@example.com')
            )
          ),
          (byte) => byte.toString(16).padStart(2, '0')
        ).join(''),
      },
    ]
    const retainedBefore = await Promise.all(
      retainedBuckets.map(({ name, key }) => readBucket(name, key))
    )
    for (const { name, key } of buckets)
      expect((await readBucket(name, key)).ts).toBeGreaterThan(0)
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
    await confirmOperation(backend, alice, 'account.delete')
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
    for (const { name, key } of buckets)
      expect((await readBucket(name, key)).ts).toBe(0)
    expect(
      await Promise.all(
        retainedBuckets.map(({ name, key }) => readBucket(name, key))
      )
    ).toEqual(retainedBefore)
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
