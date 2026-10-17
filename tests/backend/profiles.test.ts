import { afterEach, expect, test, vi } from 'vitest'

import { api, internal, components } from '../../convex/_generated/api'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

afterEach(() => vi.unstubAllEnvs())
// Owns transactional uniqueness and server policy; E2E owns generic HTTP bypass.
test('normalizes Unicode, spaces and case before atomically claiming a pseudo', async () => {
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'alice@example.test')
  const bob = await createAuthenticatedUser(backend, 'bob@example.test')
  expect(
    (await alice.client.query(api.auth.getCurrentUser, {}))?.requiresName
  ).toBe(true)
  const results = await Promise.allSettled([
    alice.client.mutation(api.account.setDisplayName, {
      expectedVersion:
        (await alice.client.query(api.auth.getCurrentUser, {}))
          ?.profileVersion ?? 0,
      name: '  Ａlice\u00A0 du   Parc ',
    }),
    bob.client.mutation(api.account.setDisplayName, {
      expectedVersion:
        (await bob.client.query(api.auth.getCurrentUser, {}))?.profileVersion ??
        0,
      name: 'alice du parc',
    }),
  ])
  expect(
    results.filter((result) => result.status === 'fulfilled')
  ).toHaveLength(1)
  const rejected = results.find((result) => result.status === 'rejected')
  const reason: unknown = rejected?.reason
  expect(
    reason instanceof Error && reason.message.includes('USERNAME_TAKEN')
  ).toBe(true)
  for (const name of ['a', 'x'.repeat(33), 'unsafe<script>', '\u200Bhidden'])
    await expect(
      alice.client.mutation(api.account.setDisplayName, {
        expectedVersion:
          (await alice.client.query(api.auth.getCurrentUser, {}))
            ?.profileVersion ?? 0,
        name,
      })
    ).rejects.toThrow('INVALID_USERNAME')
})
test('server policy permits optional and nonunique names while bounded migration preserves legacy display values', async () => {
  vi.stubEnv('PROFILE_NAME_REQUIRED', 'false')
  vi.stubEnv('PROFILE_NAME_UNIQUE', 'false')
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'alice@example.test')
  const bob = await createAuthenticatedUser(backend, 'bob@example.test')
  expect(
    (await alice.client.query(api.auth.getCurrentUser, {}))?.requiresName
  ).toBe(false)
  await alice.client.mutation(api.account.setDisplayName, {
    expectedVersion:
      (await alice.client.query(api.auth.getCurrentUser, {}))?.profileVersion ??
      0,
    name: 'Same Name',
  })
  await bob.client.mutation(api.account.setDisplayName, {
    expectedVersion:
      (await bob.client.query(api.auth.getCurrentUser, {}))?.profileVersion ??
      0,
    name: 'same name',
  })
  const before = await bob.client.query(api.auth.getCurrentUser, {})
  expect(
    (await backend.mutation(internal.profileNames.backfill, { cursor: null }))
      .isDone
  ).toBe(true)
  await backend.mutation(internal.profileNames.backfill, { cursor: null })
  expect(await bob.client.query(api.auth.getCurrentUser, {})).toEqual(before)
})

test('two edits of the same profile cannot overwrite a newer name with a stale version', async () => {
  const backend = createBackendTest()
  const user = await createAuthenticatedUser(
    backend,
    'same-account@example.test'
  )
  const profile = await user.client.query(api.auth.getCurrentUser, {})
  if (!profile) throw new Error('Missing profile fixture')
  await user.client.mutation(api.account.setDisplayName, {
    name: 'First edit',
    expectedVersion: profile.profileVersion,
  })
  // Native auth metadata can write the same millisecond timestamp again;
  // a dedicated profile revision must still reject the older draft.
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'user',
      where: [{ field: '_id', value: user.userId }],
      update: { updatedAt: profile.updatedAt },
    },
  })
  await expect(
    user.client.mutation(api.account.setDisplayName, {
      name: 'Stale edit',
      expectedVersion: profile.profileVersion,
    })
  ).rejects.toThrow('CONFLICT')
  expect((await user.client.query(api.auth.getCurrentUser, {}))?.name).toBe(
    'First edit'
  )
})
