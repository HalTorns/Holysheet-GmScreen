import { afterEach, expect, test, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import {
  confirmOperation,
  createAuthenticatedUser,
  createBackendTest,
} from './fixtures'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

test.each(['account', 'organization'] as const)(
  'restoring data without scheduled functions resumes %s deletion across multiple batches',
  async (kind) => {
    vi.useFakeTimers()
    vi.stubEnv('ORGANIZATIONS_ENABLED', 'true')
    const source = createBackendTest()
    const user = await createAuthenticatedUser(source, 'deleting@example.test')
    const organizationId =
      kind === 'organization'
        ? await user.client.mutation(api.organizations.create, {
            name: 'Deleting team',
          })
        : undefined
    await source.run(async (ctx) => {
      for (let index = 0; index < 205; index++)
        await ctx.db.insert('resources', {
          ownerId: user.userId,
          ...(organizationId ? { organizationId } : {}),
          title: `To delete ${index}`,
          description: '',
          updatedAt: Date.now(),
        })
      await ctx.db.insert('resources', {
        ownerId: 'unrelated-account',
        title: 'Keep me',
        description: '',
        updatedAt: Date.now(),
      })
    })
    if (organizationId) {
      await confirmOperation(
        source,
        user,
        `organization.delete:${organizationId}`
      )
      await user.client.mutation(api.organizations.remove, {
        organizationId,
        confirmation: 'DELETE',
      })
    } else {
      await confirmOperation(source, user, 'account.delete')
      await user.client.mutation(api.account.deleteAccount, {
        confirmation: 'DELETE',
      })
    }
    // Logical restore copies application data but loses the scheduler, as Convex exports do.
    const snapshot = await source.run(async (ctx) => ({
      resources: await ctx.db.query('resources').collect(),
      jobs: await ctx.db.query('cleanupJobs').collect(),
    }))
    await source.finishAllScheduledFunctions(vi.runAllTimers)
    const restored = createBackendTest()
    await restored.run(async (ctx) => {
      for (const { _id, _creationTime, ...resource } of snapshot.resources)
        await ctx.db.insert('resources', resource)
      for (const { _id, _creationTime, ...job } of snapshot.jobs)
        await ctx.db.insert('cleanupJobs', job)
    })
    vi.setSystemTime(Date.now() + 10 * 60 * 1000)
    // This is the same internal entry point run by the production reconciliation cron.
    await restored.mutation(internal.cleanup.resumePending, {})
    await restored.finishAllScheduledFunctions(vi.runAllTimers)
    const remaining = await restored.run((ctx) =>
      ctx.db.query('resources').collect()
    )
    expect(remaining.map(({ title }) => title)).toEqual(['Keep me'])
    expect(
      await restored.run((ctx) => ctx.db.query('cleanupJobs').collect())
    ).toEqual([])
  }
)
