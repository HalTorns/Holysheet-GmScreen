import { afterEach, expect, test, vi } from 'vitest'
import { z } from 'zod'

import { api, components } from '../../convex/_generated/api'
import { createBackendTest, createAuthenticatedUser } from './fixtures'

const idSchema = z.object({ _id: z.string() })
const listArgs = { paginationOpts: { numItems: 10, cursor: null } }
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

// Existing authorization tests cover ordinary sessions. These cases own durable
// MFA assurance, factor rotation and the separate lifetime of support access.
test('a pending factor blocks data even with MFA disabled, and a replaced factor rejects an old proof', async () => {
  const backend = createBackendTest()
  const user = await createAuthenticatedUser(backend, 'factor@example.test')
  await user.client.mutation(api.gm.createProject, {
    title: 'Private',
  })
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'user',
      where: [{ field: '_id', value: user.userId }],
      update: { twoFactorEnabled: true },
    },
  })
  async function factor() {
    return idSchema.parse(
      await backend.mutation(components.betterAuth.adapter.create, {
        input: {
          model: 'twoFactor',
          data: {
            userId: user.userId,
            secret: 'encrypted-by-sdk',
            backupCodes: 'encrypted-by-sdk',
            verified: true,
          },
        },
      })
    )._id
  }
  const original = await factor()
  vi.stubEnv('AUTH_MFA_ENABLED', 'false')
  expect(await user.client.query(api.auth.getCurrentUser, {})).toBeNull()
  await expect(
    user.client.query(api.gm.listProjects, listArgs)
  ).rejects.toThrow('MFA_REQUIRED')
  await expect(
    user.client.mutation(api.gm.createProject, {
      title: 'Denied',
    })
  ).rejects.toThrow('MFA_REQUIRED')
  await backend.mutation(components.betterAuth.access.verifySessionFactor, {
    sessionId: user.sessionId,
    userId: user.userId,
    factorId: original,
  })
  expect(
    (await user.client.query(api.gm.listProjects, listArgs)).page
  ).toHaveLength(1)
  await backend.mutation(components.betterAuth.adapter.deleteOne, {
    input: { model: 'twoFactor', where: [{ field: '_id', value: original }] },
  })
  const replacement = await factor()
  await expect(
    backend.mutation(components.betterAuth.access.verifySessionFactor, {
      sessionId: user.sessionId,
      userId: user.userId,
      factorId: original,
    })
  ).rejects.toThrow('UNAUTHENTICATED')
  await expect(
    user.client.query(api.gm.listProjects, listArgs)
  ).rejects.toThrow('MFA_REQUIRED')
  await backend.mutation(components.betterAuth.access.verifySessionFactor, {
    sessionId: user.sessionId,
    userId: user.userId,
    factorId: replacement,
  })
  const audit = await user.client.query(api.account.exportSecurityAudit, {
    scope: 'actor',
    ...listArgs,
  })
  expect(audit.page).toHaveLength(2)
  expect(
    (await user.client.query(api.gm.listProjects, listArgs)).page
  ).toHaveLength(1)
})

test('historical impersonated sessions are refused even with an authorized MFA operator', async () => {
  vi.useFakeTimers()
  const backend = createBackendTest()
  const actor = await createAuthenticatedUser(backend, 'admin@example.test')
  const target = await createAuthenticatedUser(backend, 'target@example.test')
  const factor = idSchema.parse(
    await backend.mutation(components.betterAuth.adapter.create, {
      input: {
        model: 'twoFactor',
        data: {
          userId: actor.userId,
          secret: 'encrypted-by-sdk',
          backupCodes: 'encrypted-by-sdk',
          verified: true,
        },
      },
    })
  )._id
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'user',
      where: [{ field: '_id', value: actor.userId }],
      update: { twoFactorEnabled: true },
    },
  })
  await backend.mutation(components.betterAuth.access.verifySessionFactor, {
    userId: actor.userId,
    sessionId: actor.sessionId,
    factorId: factor,
  })

  vi.stubEnv('AUTH_ADMIN_ENABLED', 'true')
  vi.stubEnv('ADMIN_USER_IDS', actor.userId)
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'session',
      where: [{ field: '_id', value: target.sessionId }],
      update: { impersonatedBy: actor.userId },
    },
  })
  // A historical link and a valid operator assurance must not restore access.
  await backend.mutation(components.betterAuth.access.recordImpersonation, {
    actorId: actor.userId,
    actorSessionId: actor.sessionId,
    targetId: target.userId,
    sessionId: target.sessionId,
  })
  expect(await target.client.query(api.auth.getCurrentUser, {})).toBeNull()
  expect(
    await backend.query(components.betterAuth.access.getSession, {
      userId: target.userId,
      sessionId: target.sessionId,
    })
  ).toBeNull()
  await expect(
    target.client.query(api.gm.listProjects, listArgs)
  ).rejects.toThrow('UNAUTHENTICATED')
})

// The transport test owns cookie replacement; this case owns the MFA boundary:
// a correct first factor is still a pending login, with no inherited assurance.
test('same-browser replacement waits for the new session to verify its own factor', async () => {
  const backend = createBackendTest()
  const user = await createAuthenticatedUser(
    backend,
    'replace-mfa@example.test'
  )
  const factor = idSchema.parse(
    await backend.mutation(components.betterAuth.adapter.create, {
      input: {
        model: 'twoFactor',
        data: {
          userId: user.userId,
          secret: 'encrypted-fixture',
          backupCodes: 'encrypted-fixture',
          verified: true,
        },
      },
    })
  )._id
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'user',
      where: [{ field: '_id', value: user.userId }],
      update: { twoFactorEnabled: true },
    },
  })
  await backend.mutation(components.betterAuth.access.verifySessionFactor, {
    userId: user.userId,
    sessionId: user.sessionId,
    factorId: factor,
  })
  const sessionId = idSchema.parse(
    await backend.mutation(components.betterAuth.adapter.create, {
      input: {
        model: 'session',
        data: {
          userId: user.userId,
          token: crypto.randomUUID(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          expiresAt: Date.now() + 3_600_000,
        },
      },
    })
  )._id
  const pending = backend.withIdentity({ ...user.identity, sessionId })
  await backend.mutation(components.betterAuth.access.replaceSession, {
    userId: user.userId,
    previousId: user.sessionId,
    sessionId,
  })
  expect(await pending.query(api.auth.getCurrentUser, {})).toBeNull()
  expect(await user.client.query(api.auth.getCurrentUser, {})).not.toBeNull()
  // A second first-factor attempt in the same browser must carry forward the
  // original verified predecessor, without inheriting its factor assurance.
  const retryId = idSchema.parse(
    await backend.mutation(components.betterAuth.adapter.create, {
      input: {
        model: 'session',
        data: {
          userId: user.userId,
          token: crypto.randomUUID(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          expiresAt: Date.now() + 3_600_000,
        },
      },
    })
  )._id
  const retry = backend.withIdentity({ ...user.identity, sessionId: retryId })
  await backend.mutation(components.betterAuth.access.replaceSession, {
    userId: user.userId,
    previousId: sessionId,
    sessionId: retryId,
  })
  expect(await retry.query(api.auth.getCurrentUser, {})).toBeNull()
  expect(await user.client.query(api.auth.getCurrentUser, {})).not.toBeNull()
  await backend.mutation(components.betterAuth.access.verifySessionFactor, {
    userId: user.userId,
    sessionId: retryId,
    factorId: factor,
  })
  expect(await retry.query(api.auth.getCurrentUser, {})).not.toBeNull()
  expect(await pending.query(api.auth.getCurrentUser, {})).toBeNull()
  expect(await user.client.query(api.auth.getCurrentUser, {})).toBeNull()
})
