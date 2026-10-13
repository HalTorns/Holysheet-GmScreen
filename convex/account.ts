import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import { requireRecentUser } from './lib/auth'
import { limitUserOperation } from './lib/rateLimits'
import { listOwnedResources } from './lib/resources'
import { publicUserValidator, resourcePageValidator } from './lib/validators'
import {
  invitationValidator,
  organizationSummaryValidator,
} from './lib/organizationValidators'

export const exportData = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    profile: publicUserValidator,
    resources: resourcePageValidator,
    organizations: v.array(organizationSummaryValidator),
    invitations: v.array(invitationValidator),
    exportedAt: v.number(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    const user = await requireRecentUser(ctx)
    return {
      profile: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
      resources: await listOwnedResources(ctx, user._id, paginationOpts),
      organizations: await ctx.runQuery(
        components.betterAuth.organizations.listMine,
        { userId: user._id },
      ),
      invitations: await ctx.runQuery(
        components.betterAuth.organizations.incoming,
        { email: user.email },
      ),
      exportedAt: Date.now(),
    }
  },
})

export const removePasskey = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireRecentUser(ctx)
    await limitUserOperation(ctx, 'accountSensitive', user._id)
    await ctx.runMutation(components.betterAuth.lifecycle.removePasskey, {
      userId: user._id,
      passkeyId: id,
    })
    await ctx.db.insert('securityEvents', {
      event: 'passkey.deleted',
      actorId: user._id,
    })
    return null
  },
})

export const deleteAccount = mutation({
  args: { confirmation: v.literal('DELETE') },
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireRecentUser(ctx)
    await limitUserOperation(ctx, 'accountSensitive', user._id)
    // Removing the auth user blocks every existing session immediately.
    // Detach memberships atomically; a last owner must first transfer ownership.
    await ctx.runMutation(components.betterAuth.organizations.detachUser, {
      userId: user._id,
    })
    await ctx.runMutation(components.betterAuth.lifecycle.deleteUser, {
      userId: user._id,
    })
    await ctx.scheduler.runAfter(0, internal.cleanup.deletedAccount, {
      userId: user._id,
      email: user.email,
    })
    await ctx.db.insert('securityEvents', { event: 'account.deleted' })
    return null
  },
})
