import type { FunctionReturnType } from 'convex/server'
import { afterEach, expect, test, vi } from 'vitest'

import { api, components } from '../../convex/_generated/api'
import { z } from '../../shared/zod'
import {
  confirmOperation,
  createAuthenticatedUser,
  createBackendTest,
} from './fixtures'

const pageOptions = { numItems: 2, cursor: null }
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})
async function fixture() {
  vi.useFakeTimers()
  const backend = createBackendTest()
  const admin = await createAuthenticatedUser(backend, 'admin@example.test')
  const member = await createAuthenticatedUser(backend, 'member@example.test')
  vi.stubEnv('AUTH_ADMIN_ENABLED', 'false')
  vi.stubEnv('ADMIN_USER_IDS', member.userId)
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'user',
      where: [{ field: '_id', value: admin.userId }],
      update: { role: 'admin' },
    },
  })
  const read = (targetId: string) =>
    admin.client.query(api.userAdmin.read, { targetId })
  return { backend, admin, member, read }
}

// These tests own current Better Auth roles, immediate revocation and atomic
// moderation invariants. Browser tests own forms, cookies and notifications.
test('native role admin authorizes paginated user management while allowlisted ordinary users cannot access it', async () => {
  const { backend, admin, member, read } = await fixture()
  const third = await createAuthenticatedUser(backend, 'other@example.test')
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'user',
      where: [{ field: '_id', value: third.userId }],
      update: { name: 'Éloïse du Parc', nameKey: 'éloïse du parc' },
    },
  })
  expect(
    (
      await admin.client.query(api.userAdmin.list, {
        search: 'élo',
        field: 'name',
        paginationOpts: pageOptions,
      })
    ).page.map((user) => user.id)
  ).toEqual([third.userId])
  await expect(
    member.client.query(api.userAdmin.list, {
      search: '',
      paginationOpts: pageOptions,
    })
  ).rejects.toThrow('FORBIDDEN')
  await expect(
    backend.query(api.userAdmin.read, { targetId: member.userId })
  ).rejects.toThrow('UNAUTHENTICATED')
  await expect(
    member.client.mutation(api.userAdmin.apply, {
      targetId: member.userId,
      expectedVersion: 0,
      change: { kind: 'role', role: 'admin' },
    })
  ).rejects.toThrow('FORBIDDEN')
  const first = await admin.client.query(api.userAdmin.list, {
    search: '',
    paginationOpts: pageOptions,
  })
  const next = await admin.client.query(api.userAdmin.list, {
    search: '',
    paginationOpts: { ...pageOptions, cursor: first.continueCursor },
  })
  expect(
    new Set([...first.page, ...next.page].map((user) => user.id)).size
  ).toBe(3)
  expect(first.isDone).toBe(false)
  expect(next.isDone).toBe(true)
  expect(
    (
      await admin.client.query(api.userAdmin.list, {
        search: 'mem',
        paginationOpts: pageOptions,
      })
    ).page.map((user) => user.id)
  ).toEqual([member.userId])
  await expect(
    admin.client.query(api.userAdmin.list, {
      search: '',
      paginationOpts: { numItems: 31, cursor: null },
    })
  ).rejects.toThrow('INVALID_INPUT')
  await expect(
    admin.client.query(api.userAdmin.list, {
      search: '',
      paginationOpts: { numItems: 2, cursor: 'not json' },
    })
  ).rejects.toThrow('INVALID_INPUT')
  const target = await read(member.userId)
  const promoted = await admin.client.mutation(api.userAdmin.apply, {
    targetId: member.userId,
    expectedVersion: target.adminVersion,
    change: { kind: 'role', role: 'admin' },
  })
  expect(
    (await member.client.query(api.auth.getAccessState, {}))?.isAdmin
  ).toBe(true)
  expect(
    (await member.client.query(api.userAdmin.read, { targetId: third.userId }))
      .id
  ).toBe(third.userId)
  await expect(
    admin.client.mutation(api.userAdmin.apply, {
      targetId: member.userId,
      expectedVersion: target.adminVersion,
      change: { kind: 'role', role: 'user' },
    })
  ).rejects.toThrow('CONFLICT')
  await admin.client.mutation(api.userAdmin.apply, {
    targetId: member.userId,
    expectedVersion: promoted.adminVersion,
    change: { kind: 'role', role: 'user' },
  })
  await expect(
    member.client.query(api.userAdmin.read, { targetId: third.userId })
  ).rejects.toThrow('FORBIDDEN')
  expect((await read(third.userId)).id).toBe(third.userId)
  const journal = await admin.client.query(api.userAdmin.audit, {
    targetId: member.userId,
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(
    journal.page.find((row) => row.event === 'admin.role.granted')?.actorId
  ).toBe(admin.userId)
  const personalAudit = await member.client.query(
    api.account.exportSecurityAudit,
    { scope: 'target', paginationOpts: { numItems: 10, cursor: null } }
  )
  expect(JSON.stringify(personalAudit)).not.toContain(admin.userId)
})

test('the last active administrator cannot be demoted, suspended or deleted, including concurrent demotions', async () => {
  const { backend, admin, member, read } = await fixture()
  const unverified = await createAuthenticatedUser(
    backend,
    'unverified-admin@example.test',
    { emailVerified: false }
  )
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'user',
      where: [{ field: '_id', value: unverified.userId }],
      update: { role: 'admin' },
    },
  })
  const self = await read(admin.userId)
  await expect(
    admin.client.mutation(api.userAdmin.apply, {
      targetId: admin.userId,
      expectedVersion: self.adminVersion,
      change: { kind: 'role', role: 'user' },
    })
  ).rejects.toThrow('LAST_ADMIN')
  await expect(
    admin.client.mutation(api.userAdmin.apply, {
      targetId: admin.userId,
      expectedVersion: self.adminVersion,
      change: { kind: 'ban', reason: 'Fixture', days: null },
    })
  ).rejects.toThrow('LAST_ADMIN')
  await confirmOperation(backend, admin, 'account.delete')
  await expect(
    admin.client.mutation(api.account.deleteAccount, { confirmation: 'DELETE' })
  ).rejects.toThrow('LAST_ADMIN')
  const memberBefore = await read(member.userId)
  const second = await admin.client.mutation(api.userAdmin.apply, {
    targetId: member.userId,
    expectedVersion: memberBefore.adminVersion,
    change: { kind: 'role', role: 'admin' },
  })
  const changes = await Promise.allSettled([
    admin.client.mutation(api.userAdmin.apply, {
      targetId: member.userId,
      expectedVersion: second.adminVersion,
      change: { kind: 'role', role: 'user' },
    }),
    member.client.mutation(api.userAdmin.apply, {
      targetId: admin.userId,
      expectedVersion: self.adminVersion,
      change: { kind: 'role', role: 'user' },
    }),
  ])
  expect(
    changes.filter((result) => result.status === 'fulfilled')
  ).toHaveLength(1)
  const statuses = await Promise.all([
    admin.client.query(api.auth.getAccessState, {}),
    member.client.query(api.auth.getAccessState, {}),
  ])
  expect(statuses.filter((status) => status?.isAdmin)).toHaveLength(1)
  expect(await backend.query(api.auth.getCurrentUser, {})).toBeNull()
})

test('suspension blocks existing sessions immediately and lifting it never restores a revoked session', async () => {
  const { backend, admin, member, read } = await fixture()
  const before = await read(member.userId)
  const suspended = await admin.client.mutation(api.userAdmin.apply, {
    targetId: member.userId,
    expectedVersion: before.adminVersion,
    change: {
      kind: 'ban',
      reason: 'Harassment in a synthetic moderation fixture.',
      days: 7,
    },
  })
  expect(suspended.banned).toBe(true)
  await expect(
    member.client.query(api.gm.listProjects, { paginationOpts: pageOptions })
  ).rejects.toThrow('UNAUTHENTICATED')
  const restored = await admin.client.mutation(api.userAdmin.apply, {
    targetId: member.userId,
    expectedVersion: suspended.adminVersion,
    change: { kind: 'unban' },
  })
  expect(restored).toMatchObject({
    banned: false,
    banReason: null,
    banExpires: null,
  })
  await expect(
    member.client.query(api.gm.listProjects, { paginationOpts: pageOptions })
  ).rejects.toThrow('UNAUTHENTICATED')
  await backend.finishAllScheduledFunctions(vi.runAllTimers)
  expect(
    (
      await admin.client.query(api.userAdmin.sessions, {
        targetId: member.userId,
      })
    ).page
  ).toHaveLength(0)
})

test('session revocation denies every old bearer before bounded cleanup and preserves a subsequent login and another account', async () => {
  const { backend, admin, member, read } = await fixture()
  const now = Date.now()
  for (let index = 0; index < 105; index += 1)
    await backend.mutation(components.betterAuth.adapter.create, {
      input: {
        model: 'session',
        data: {
          userId: member.userId,
          token: crypto.randomUUID(),
          createdAt: now - 1000,
          updatedAt: now - 1000,
          expiresAt: now + 3_600_000,
        },
      },
    })
  const target = await read(member.userId)
  await admin.client.mutation(api.userAdmin.apply, {
    targetId: member.userId,
    expectedVersion: target.adminVersion,
    change: { kind: 'revoke' },
  })
  await expect(
    member.client.query(api.gm.listProjects, { paginationOpts: pageOptions })
  ).rejects.toThrow('UNAUTHENTICATED')
  expect(
    (
      await admin.client.query(api.gm.listProjects, {
        paginationOpts: pageOptions,
      })
    ).page
  ).toEqual([])
  vi.advanceTimersByTime(1)
  const session: unknown = await backend.mutation(
    components.betterAuth.adapter.create,
    {
      input: {
        model: 'session',
        data: {
          userId: member.userId,
          token: 'synthetic-session-token-must-not-be-returned',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          expiresAt: now + 3_600_000,
        },
      },
    }
  )
  const id = z.object({ _id: z.string() }).parse(session)._id
  const renewed = backend.withIdentity({ ...member.identity, sessionId: id })
  expect(
    (await renewed.query(api.gm.listProjects, { paginationOpts: pageOptions }))
      .page
  ).toEqual([])
  const sessions = await admin.client.query(api.userAdmin.sessions, {
    targetId: member.userId,
  })
  expect(sessions.page.map((value) => value.id)).toEqual([id])
  expect(JSON.stringify(sessions)).not.toContain(
    'synthetic-session-token-must-not-be-returned'
  )
  const exported = await renewed.query(api.account.exportData, {
    paginationOpts: pageOptions,
  })
  expect(exported.accountStatus.sessionsRevokedAt).toBe(now)
  const audit = await renewed.query(api.account.exportSecurityAudit, {
    scope: 'target',
    paginationOpts: pageOptions,
  })
  expect(audit.page.map((row) => row.event)).toContain('admin.sessions.revoked')
  await backend.finishAllScheduledFunctions(vi.runAllTimers)
  expect(
    (
      await admin.client.query(api.userAdmin.sessions, {
        targetId: member.userId,
      })
    ).page.map((value) => value.id)
  ).toEqual([id])
  await confirmOperation(
    backend,
    { userId: member.userId, sessionId: id },
    'account.delete'
  )
  await renewed.mutation(api.account.deleteAccount, { confirmation: 'DELETE' })
  await backend.finishAllScheduledFunctions(vi.runAllTimers)
  const deleted: unknown = await backend.query(
    components.betterAuth.adapter.findMany,
    {
      model: 'sessionRevocations',
      where: [{ field: 'userId', value: member.userId }],
      paginationOpts: { numItems: 10, cursor: null },
    }
  )
  expect(
    z.object({ page: z.array(z.unknown()) }).parse(deleted).page
  ).toHaveLength(0)
})

// A preview must cap inspected sessions, even when expired rows hide older active
// sessions. Revocation-only coverage does not exercise this sparse result set.
test('the session preview scans at most 100 recent candidates and signals an incomplete active list', async () => {
  const { backend, admin, member, read } = await fixture()
  const cutoff = Date.now()
  const target = await read(member.userId)
  await admin.client.mutation(api.userAdmin.apply, {
    targetId: member.userId,
    expectedVersion: target.adminVersion,
    change: { kind: 'revoke' },
  })
  vi.advanceTimersByTime(1000)
  let recentActiveId = ''
  for (let index = 0; index < 101; index++) {
    const session: unknown = await backend.mutation(
      components.betterAuth.adapter.create,
      {
        input: {
          model: 'session',
          data: {
            userId: member.userId,
            token: crypto.randomUUID(),
            createdAt: cutoff + index + 1,
            updatedAt: cutoff + index + 1,
            expiresAt:
              index === 0 || index === 50
                ? Date.now() + 3_600_000
                : Date.now() - 1,
          },
        },
      }
    )
    if (index === 50)
      recentActiveId = z.object({ _id: z.string() }).parse(session)._id
  }
  const preview = await admin.client.query(api.userAdmin.sessions, {
    targetId: member.userId,
  })
  expect(preview.page.map((session) => session.id)).toEqual([recentActiveId])
  expect(preview.hasMore).toBe(true)
})

test('indexed name pagination includes every duplicate when uniqueness is disabled and role filters remain scoped', async () => {
  vi.stubEnv('PROFILE_NAME_UNIQUE', 'false')
  const { backend, admin, member } = await fixture()
  const third = await createAuthenticatedUser(backend, 'third@example.test')
  for (const user of [admin, member, third]) {
    const profile = await user.client.query(api.auth.getCurrentUser, {})
    if (!profile) throw new Error('Missing profile fixture')
    await user.client.mutation(api.account.setDisplayName, {
      name: 'Éloïse commune',
      expectedVersion: profile.profileVersion,
    })
  }
  let cursor: string | null = null
  const ids: string[] = []
  for (let page = 0; page < 3; page++) {
    const result: FunctionReturnType<typeof api.userAdmin.list> =
      await admin.client.query(api.userAdmin.list, {
        field: 'name',
        search: 'ÉLO',
        paginationOpts: { numItems: 1, cursor },
      })
    ids.push(...result.page.map((user) => user.id))
    expect(result.isDone).toBe(page === 2)
    cursor = result.continueCursor
  }
  expect(new Set(ids)).toEqual(
    new Set([admin.userId, member.userId, third.userId])
  )
  const filtered = await admin.client.query(api.userAdmin.list, {
    field: 'name',
    search: 'élo',
    role: 'admin',
    paginationOpts: { numItems: 2, cursor: null },
  })
  expect(filtered.page.map((user) => user.id)).toEqual([admin.userId])
})

test('concurrent account deletions cannot remove every active administrator', async () => {
  const { backend, admin, member, read } = await fixture()
  const before = await read(member.userId)
  await admin.client.mutation(api.userAdmin.apply, {
    targetId: member.userId,
    expectedVersion: before.adminVersion,
    change: { kind: 'role', role: 'admin' },
  })
  await confirmOperation(backend, admin, 'account.delete')
  await confirmOperation(backend, member, 'account.delete')
  const results = await Promise.allSettled(
    [admin.client, member.client].map((client) =>
      client.mutation(api.account.deleteAccount, { confirmation: 'DELETE' })
    )
  )
  expect(
    results.filter((result) => result.status === 'fulfilled')
  ).toHaveLength(1)
  const statuses = await Promise.all(
    [admin.client, member.client].map((client) =>
      client.query(api.auth.getAccessState, {})
    )
  )
  expect(statuses.filter((state) => state?.isAdmin)).toHaveLength(1)
  await backend.finishAllScheduledFunctions(vi.runAllTimers)
})
