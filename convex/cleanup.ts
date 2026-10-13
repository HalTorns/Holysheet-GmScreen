import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import { internalMutation } from './_generated/server'

const BATCH_SIZE = 100
const SECURITY_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000

export const deletedAccount = internalMutation({
  args: { userId: v.string(), email: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, email }) => {
    const resources = await ctx.db
      .query('resources')
      .withIndex('by_owner', (index) => index.eq('ownerId', userId))
      .take(BATCH_SIZE)
    const events = await ctx.db
      .query('securityEvents')
      .withIndex('by_actor', (index) => index.eq('actorId', userId))
      .take(BATCH_SIZE)
    for (const resource of resources) {
      if (resource.organizationId !== undefined)
        await ctx.db.patch('resources', resource._id, {
          ownerId: 'deleted-user',
        })
      else await ctx.db.delete('resources', resource._id)
    }
    for (const event of events) await ctx.db.delete('securityEvents', event._id)
    const credentialsRemain = await ctx.runMutation(
      components.betterAuth.lifecycle.cleanupUserCredentials,
      { userId },
    )
    const invitationsRemain = await ctx.runMutation(
      components.betterAuth.organizations.cleanupUserInvitations,
      { userId, email },
    )
    if (
      resources.length === BATCH_SIZE ||
      events.length === BATCH_SIZE ||
      credentialsRemain ||
      invitationsRemain
    ) {
      await ctx.scheduler.runAfter(0, internal.cleanup.deletedAccount, {
        userId,
        email,
      })
    }
    return null
  },
})

export const expiredData = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - SECURITY_EVENT_RETENTION_MS
    const events = await ctx.db
      .query('securityEvents')
      .withIndex('by_creation_time', (index) =>
        index.lt('_creationTime', cutoff),
      )
      .take(BATCH_SIZE)
    for (const event of events) await ctx.db.delete('securityEvents', event._id)
    const authDataRemain = await ctx.runMutation(
      components.betterAuth.lifecycle.cleanupExpired,
      {},
    )
    const invitationsRemain = await ctx.runMutation(
      components.betterAuth.organizations.cleanupExpiredInvitations,
      {},
    )
    if (events.length === BATCH_SIZE || authDataRemain || invitationsRemain)
      await ctx.scheduler.runAfter(0, internal.cleanup.expiredData, {})
    return null
  },
})

export const deletedOrganization = internalMutation({
  args: { organizationId: v.string() },
  returns: v.null(),
  handler: async (ctx, { organizationId }) => {
    const resources = await ctx.db
      .query('resources')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', organizationId),
      )
      .take(BATCH_SIZE)
    const events = await ctx.db
      .query('securityEvents')
      .withIndex('by_organization', (q) =>
        q.eq('organizationId', organizationId),
      )
      .take(BATCH_SIZE)
    for (const resource of resources)
      await ctx.db.delete('resources', resource._id)
    for (const event of events) await ctx.db.delete('securityEvents', event._id)
    const metadataRemain = await ctx.runMutation(
      components.betterAuth.organizations.cleanupOrganization,
      { organizationId },
    )
    if (
      resources.length === BATCH_SIZE ||
      events.length === BATCH_SIZE ||
      metadataRemain
    )
      await ctx.scheduler.runAfter(0, internal.cleanup.deletedOrganization, {
        organizationId,
      })
    return null
  },
})
