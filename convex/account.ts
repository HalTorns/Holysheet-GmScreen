import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { displayNameSchema } from '../shared/validation'
import { components, internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import {
  requireUser,
  requireAccountUser,
  requireConfirmedUser,
} from './lib/auth'
import {
  invitationValidator,
  organizationSummaryValidator,
} from './lib/organizationValidators'
import { getProfilePolicy } from './lib/profilePolicy'
import { limitUserOperation } from './lib/rateLimits'
import { listOwnedResources } from './lib/resources'
import { ownAccountStatus } from './lib/userAdminValidators'
import { publicUserValidator, resourcePageValidator } from './lib/validators'

export const exportSecurityAudit = query({
  args: {
    scope: v.union(v.literal('actor'), v.literal('target')),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(v.object({ event: v.string(), createdAt: v.number() })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await requireAccountUser(ctx)
    const result = await ctx.runQuery(
      components.betterAuth.access.exportAudit,
      {
        userId: user._id,
        ...args,
      }
    )
    // The personal export omits identities of other actors. Application admins
    // use their separately authorized audit endpoint for accountability.
    return {
      ...result,
      page: result.page.map(({ event, createdAt }) => ({ event, createdAt })),
    }
  },
})

// Application events written by this account (securityEvents.actorId). Only
// the event name and its time leave the backend, like exportSecurityAudit.
export const exportApplicationEvents = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(v.object({ event: v.string(), createdAt: v.number() })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    const user = await requireAccountUser(ctx)
    const { page, isDone, continueCursor } = await ctx.db
      .query('securityEvents')
      .withIndex('by_actor', (index) => index.eq('actorId', user._id))
      .paginate({
        ...paginationOpts,
        numItems: Math.min(100, Math.max(1, paginationOpts.numItems)),
      })
    return {
      isDone,
      continueCursor,
      page: page.map(({ event, _creationTime }) => ({
        event,
        createdAt: _creationTime,
      })),
    }
  },
})

export const exportData = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    profile: publicUserValidator,
    accountStatus: ownAccountStatus,
    resources: resourcePageValidator,
    organizations: v.array(organizationSummaryValidator),
    invitations: v.array(invitationValidator),
    exportedAt: v.number(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    const user = await requireAccountUser(ctx)
    return {
      profile: {
        id: user._id,
        name: user.name,
        updatedAt: user.updatedAt,
        profileVersion: user.profileVersion ?? 0,
        hasName: Boolean(user.nameKey),
        requiresName: getProfilePolicy().required && !user.nameKey,
        email: user.email,
        createdAt: user.createdAt,
      },
      accountStatus: await ctx.runQuery(
        components.betterAuth.userAdministration.status,
        { userId: user._id }
      ),
      resources: await listOwnedResources(ctx, user._id, paginationOpts),
      organizations: await ctx.runQuery(
        components.betterAuth.organizations.listMine,
        { userId: user._id }
      ),
      invitations: await ctx.runQuery(
        components.betterAuth.organizations.incoming,
        { email: user.email }
      ),
      exportedAt: Date.now(),
    }
  },
})

export const removePasskey = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireConfirmedUser(ctx, `passkey.remove:${id}`)
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
    const user = await requireConfirmedUser(ctx, 'account.delete')
    await limitUserOperation(ctx, 'accountSensitive', user._id)
    // Removing the auth user blocks every existing session immediately.
    // Detach memberships atomically; a last owner must first transfer ownership.
    await ctx.runMutation(components.betterAuth.organizations.detachUser, {
      userId: user._id,
    })
    await ctx.runMutation(components.betterAuth.lifecycle.deleteUser, {
      userId: user._id,
    })
    await ctx.runMutation(internal.cleanup.deletedAccount, {
      userId: user._id,
      email: user.email,
    })
    await ctx.db.insert('securityEvents', { event: 'account.deleted' })
    return null
  },
})

export const setDisplayName = mutation({
  args: { name: v.string(), expectedVersion: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const parsed = displayNameSchema.safeParse(args.name)
    if (!parsed.success) throw new ConvexError({ code: 'INVALID_USERNAME' })
    await limitUserOperation(ctx, 'accountSensitive', user._id)
    return ctx.runMutation(components.betterAuth.profiles.setName, {
      userId: user._id,
      expectedVersion: args.expectedVersion,
      name: parsed.data,
      unique: getProfilePolicy().unique,
    })
  },
})
