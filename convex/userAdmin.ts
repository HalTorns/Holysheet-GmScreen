import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { components } from './_generated/api'
import { internalMutation, mutation, query } from './_generated/server'
import { limitUserOperation } from './lib/rateLimits'
import { requireSiteAdmin } from './lib/siteAdmin'
import {
  managedUser,
  managedUsersPage,
  managedSessions,
  moderationChange,
} from './lib/userAdminValidators'

export const list = query({
  args: {
    search: v.string(),
    field: v.optional(v.union(v.literal('email'), v.literal('name'))),
    role: v.optional(v.union(v.literal('user'), v.literal('admin'))),
    paginationOpts: paginationOptsValidator,
  },
  returns: managedUsersPage,
  handler: async (ctx, args) => {
    const { user, sessionId } = await requireSiteAdmin(ctx)
    return ctx.runQuery(components.betterAuth.userAdministration.list, {
      ...args,
      actorId: user._id,
      sessionId,
    })
  },
})
export const read = query({
  args: { targetId: v.string() },
  returns: managedUser,
  handler: async (ctx, args) => {
    const { user, sessionId } = await requireSiteAdmin(ctx)
    return ctx.runQuery(components.betterAuth.userAdministration.read, {
      ...args,
      actorId: user._id,
      sessionId,
    })
  },
})
export const sessions = query({
  args: { targetId: v.string() },
  returns: managedSessions,
  handler: async (ctx, args) => {
    const { user, sessionId } = await requireSiteAdmin(ctx)
    return ctx.runQuery(components.betterAuth.userAdministration.sessions, {
      ...args,
      actorId: user._id,
      sessionId,
    })
  },
})
export const apply = mutation({
  args: {
    targetId: v.string(),
    expectedVersion: v.number(),
    change: moderationChange,
  },
  returns: managedUser,
  handler: async (ctx, args) => {
    const { user, sessionId } = await requireSiteAdmin(ctx)
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    return ctx.runMutation(components.betterAuth.userAdministration.apply, {
      ...args,
      actorId: user._id,
      sessionId,
    })
  },
})
// Local operator bootstrap, used by admin:grant. There is no public self-grant.
export const grant = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: (ctx, args) =>
    ctx.runMutation(components.betterAuth.userAdministration.grant, args),
})

export const audit = query({
  args: { targetId: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({
        event: v.string(),
        actorId: v.string(),
        createdAt: v.number(),
      })
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireSiteAdmin(ctx)
    return ctx.runQuery(components.betterAuth.access.exportAudit, {
      userId: args.targetId,
      scope: 'target',
      paginationOpts: args.paginationOpts,
    })
  },
})
