import { makeFunctionReference } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, components } from '../../convex/_generated/api'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

afterEach(() => vi.useRealTimers())

describe('Owner-only resource API', () => {
  it('allows an owner to paginate, read, edit and delete while isolating another account', async () => {
    const backend = createBackendTest()
    const alice = await createAuthenticatedUser(backend, 'alice@example.com')
    const bob = await createAuthenticatedUser(backend, 'bob@example.com')
    const ids = []
    for (let index = 0; index < 3; index++) {
      ids.push(
        await alice.client.mutation(api.resources.create, {
          title: ` Alice ${index} `,
          description: ' private ',
        })
      )
    }
    const id = ids[0]
    if (!id) throw new Error('Missing resource fixture.')
    const firstPage = await alice.client.query(api.resources.list, {
      paginationOpts: { numItems: 2, cursor: null },
    })
    expect(firstPage.page).toHaveLength(2)
    expect(firstPage.isDone).toBe(false)
    const secondPage = await alice.client.query(api.resources.list, {
      paginationOpts: { numItems: 2, cursor: firstPage.continueCursor },
    })
    expect(secondPage.page).toHaveLength(1)
    expect(secondPage.isDone).toBe(true)
    expect(
      new Set(
        [...firstPage.page, ...secondPage.page].map((resource) => resource._id)
      ).size
    ).toBe(3)
    expect(
      await bob.client.query(api.resources.list, {
        paginationOpts: { numItems: 2, cursor: null },
      })
    ).toMatchObject({ page: [], isDone: true })
    expect(await bob.client.query(api.resources.get, { id })).toBeNull()
    await expect(
      bob.client.mutation(api.resources.update, {
        expectedUpdatedAt: 0,
        id,
        title: 'stolen',
        description: '',
      })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.resources.remove, { id })
    ).rejects.toThrow('NOT_FOUND')
    expect(await alice.client.query(api.resources.get, { id })).toMatchObject({
      title: 'Alice 0',
      description: 'private',
    })
    await alice.client.mutation(api.resources.update, {
      expectedUpdatedAt:
        (await alice.client.query(api.resources.get, { id }))?.updatedAt ?? 0,
      id,
      title: 'Updated',
      description: 'New description',
    })
    expect(await alice.client.query(api.resources.get, { id })).toMatchObject({
      title: 'Updated',
      description: 'New description',
    })
    const searchable = await alice.client.mutation(api.resources.create, {
      title: 'Searchable note',
      description: 'With details',
    })
    await alice.client.mutation(api.resources.create, {
      title: 'Searchable empty',
      description: '',
    })
    const foreign = await bob.client.mutation(api.resources.create, {
      title: 'Searchable note',
      description: 'Other owner',
    })
    const filters = {
      search: 'Searchable',
      described: true,
      paginationOpts: { numItems: 10, cursor: null },
    }
    expect(
      (await alice.client.query(api.resources.list, filters)).page.map(
        (row) => row._id
      )
    ).toEqual([searchable])
    expect(
      (await bob.client.query(api.resources.list, filters)).page.map(
        (row) => row._id
      )
    ).toEqual([foreign])
    expect(
      (
        await alice.client.query(api.resources.list, {
          ...filters,
          described: false,
        })
      ).page
    ).toHaveLength(2)
    await alice.client.mutation(api.resources.remove, { id })
    expect(await alice.client.query(api.resources.get, { id })).toBeNull()
  })

  it('rejects anonymous requests, expired or revoked sessions and a session belonging to another user', async () => {
    const backend = createBackendTest()
    const alice = await createAuthenticatedUser(backend, 'alice@example.com')
    const bob = await createAuthenticatedUser(backend, 'bob@example.com')
    const listArgs = { paginationOpts: { numItems: 10, cursor: null } }
    await expect(backend.query(api.resources.list, listArgs)).rejects.toThrow()
    await expect(
      backend.mutation(api.resources.create, {
        title: 'Anonymous',
        description: '',
      })
    ).rejects.toThrow()
    const mismatched = backend.withIdentity({
      ...alice.identity,
      sessionId: bob.sessionId,
    })
    await expect(
      mismatched.query(api.resources.list, listArgs)
    ).rejects.toThrow('UNAUTHENTICATED')
    await backend.mutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: 'session',
        where: [{ field: '_id', value: alice.sessionId }],
        update: { expiresAt: Date.now() - 1 },
      },
    })
    await expect(
      alice.client.query(api.resources.list, listArgs)
    ).rejects.toThrow()
    await backend.mutation(components.betterAuth.adapter.deleteOne, {
      input: {
        model: 'session',
        where: [{ field: '_id', value: bob.sessionId }],
      },
    })
    await expect(
      bob.client.mutation(api.resources.create, {
        title: 'Revoked',
        description: '',
      })
    ).rejects.toThrow()
  })

  it('requires a verified email before admitting an account to private data', async () => {
    const backend = createBackendTest()
    const user = await createAuthenticatedUser(
      backend,
      'unverified@example.com',
      { emailVerified: false }
    )
    await expect(
      user.client.mutation(api.resources.create, {
        title: 'Private',
        description: '',
      })
    ).rejects.toThrow('UNAUTHENTICATED')
    expect(await user.client.query(api.auth.getCurrentUser, {})).toBeNull()
  })

  it('validates runtime argument shapes, business limits and bounded pagination', async () => {
    const backend = createBackendTest()
    const { client } = await createAuthenticatedUser(
      backend,
      'alice@example.com'
    )
    const create = makeFunctionReference<'mutation'>('resources:create')
    for (const input of [
      { title: 42, description: '' },
      { title: 'Valid', description: '', ownerId: 'someone-else' },
    ])
      await expect(client.mutation(create, input)).rejects.toThrow()
    for (const input of [
      { title: ' ', description: '' },
      { title: 'x'.repeat(121), description: '' },
      { title: 'Valid', description: 'x'.repeat(4001) },
    ])
      await expect(
        client.mutation(api.resources.create, input)
      ).rejects.toThrow('INVALID_INPUT')
    for (const numItems of [0, 51, 1.5]) {
      await expect(
        client.query(api.resources.list, {
          paginationOpts: { numItems, cursor: null },
        })
      ).rejects.toThrow('INVALID_INPUT')
    }
    expect(
      await client.query(api.resources.list, {
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).toMatchObject({ page: [] })
  })

  it('limits writes per authenticated account while allowing another account to continue', async () => {
    vi.useFakeTimers()
    const backend = createBackendTest()
    const alice = await createAuthenticatedUser(backend, 'alice@example.com')
    const bob = await createAuthenticatedUser(backend, 'bob@example.com')
    for (let index = 0; index < 30; index++) {
      await alice.client.mutation(api.resources.create, {
        title: `Resource ${index}`,
        description: '',
      })
    }
    await expect(
      alice.client.mutation(api.resources.create, {
        title: 'Too many',
        description: '',
      })
    ).rejects.toThrow('RATE_LIMITED')
    await expect(
      bob.client.mutation(api.resources.create, {
        title: 'Allowed',
        description: '',
      })
    ).resolves.toBeTypeOf('string')
    vi.advanceTimersByTime(60_000)
    await expect(
      alice.client.mutation(api.resources.create, {
        title: 'Refilled',
        description: '',
      })
    ).resolves.toBeTypeOf('string')
  })
})

// Owns compare-and-swap; the browser test owns preserving both editors' drafts.
it('rejects a concurrent overwrite and advances versions even within one millisecond', async () => {
  vi.useFakeTimers()
  const backend = createBackendTest()
  const owner = await createAuthenticatedUser(backend, 'owner@example.test')
  const id = await owner.client.mutation(api.resources.create, {
    title: 'Original',
    description: '',
  })
  const original = await owner.client.query(api.resources.get, { id })
  if (!original) throw new Error('Missing fixture')
  const results = await Promise.allSettled(
    ['First', 'Second'].map((title) =>
      owner.client.mutation(api.resources.update, {
        id,
        expectedUpdatedAt: original.updatedAt,
        title,
        description: '',
      })
    )
  )
  expect(
    results.filter((result) => result.status === 'fulfilled')
  ).toHaveLength(1)
  const rejected = results.find((result) => result.status === 'rejected')
  const reason: unknown = rejected?.reason
  expect(reason instanceof Error && reason.message.includes('CONFLICT')).toBe(
    true
  )
  expect((await owner.client.query(api.resources.get, { id }))?.updatedAt).toBe(
    original.updatedAt + 1
  )
})
