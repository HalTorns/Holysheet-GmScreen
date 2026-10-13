import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import { requireRecentUser, requireUser } from './lib/auth'
import { requireOrganizationsEnabled } from './lib/modules'
import {
  invitationRoleValidator,
  invitationValidator,
  memberValidator,
  organizationRoleValidator,
  organizationSummaryValidator,
} from './lib/organizationValidators'
import { requireOrganizationPermission } from './lib/organizations'
import { limitUserOperation } from './lib/rateLimits'
import { listOrganizationResources } from './lib/resources'
import { resourcePageValidator } from './lib/validators'

export const list = query({
  args: {},
  returns: v.array(organizationSummaryValidator),
  handler: async (ctx) => {
    requireOrganizationsEnabled()
    const user = await requireUser(ctx)
    return await ctx.runQuery(components.betterAuth.organizations.listMine, {
      userId: user._id,
    })
  },
})

export const get = query({
  args: { organizationId: v.string() },
  returns: v.object({
    organization: organizationSummaryValidator,
    members: v.array(memberValidator),
    invitations: v.array(invitationValidator),
  }),
  handler: async (ctx, { organizationId }) => {
    requireOrganizationsEnabled()
    const user = await requireUser(ctx)
    return await ctx.runQuery(components.betterAuth.organizations.get, {
      organizationId,
      actorId: user._id,
    })
  },
})

export const invitations = query({
  args: {},
  returns: v.array(invitationValidator),
  handler: async (ctx) => {
    requireOrganizationsEnabled()
    const user = await requireUser(ctx)
    return await ctx.runQuery(components.betterAuth.organizations.incoming, {
      email: user.email,
    })
  },
})

export const create = mutation({
  args: { name: v.string() },
  returns: v.string(),
  handler: async (ctx, { name }) => {
    requireOrganizationsEnabled()
    const user = await requireRecentUser(ctx)
    await limitUserOperation(ctx, 'organizationWrite', user._id)
    const organizationId = await ctx.runMutation(
      components.betterAuth.organizations.create,
      { name, actorId: user._id },
    )
    await ctx.db.insert('securityEvents', {
      event: 'organization.created',
      organizationId,
      actorId: user._id,
    })
    return organizationId
  },
})

export const invite = mutation({
  args: {
    organizationId: v.string(),
    email: v.string(),
    role: invitationRoleValidator,
  },
  returns: v.string(),
  handler: async (ctx, input) => {
    requireOrganizationsEnabled()
    const user = await requireRecentUser(ctx)
    await limitUserOperation(ctx, 'organizationWrite', user._id)
    const id = await ctx.runMutation(
      components.betterAuth.organizations.invite,
      { ...input, actorId: user._id },
    )
    await ctx.db.insert('securityEvents', {
      event: 'organization.invited',
      organizationId: input.organizationId,
      actorId: user._id,
    })
    return id
  },
})

export const rename = mutation({
  args: { organizationId: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, input) => {
    requireOrganizationsEnabled()
    const user = await requireRecentUser(ctx)
    await limitUserOperation(ctx, 'organizationWrite', user._id)
    await ctx.runMutation(components.betterAuth.organizations.rename, {
      ...input,
      actorId: user._id,
    })
    await ctx.db.insert('securityEvents', {
      event: 'organization.updated',
      organizationId: input.organizationId,
      actorId: user._id,
    })
    return null
  },
})

export const respondToInvitation = mutation({
  args: { invitationId: v.string(), accept: v.boolean() },
  returns: v.string(),
  handler: async (ctx, input) => {
    requireOrganizationsEnabled()
    const user = await requireUser(ctx)
    await limitUserOperation(ctx, 'organizationWrite', user._id)
    return await ctx.runMutation(components.betterAuth.organizations.respond, {
      ...input,
      actorId: user._id,
      email: user.email,
    })
  },
})

export const cancelInvitation = mutation({
  args: { invitationId: v.string() },
  returns: v.null(),
  handler: async (ctx, input) => {
    requireOrganizationsEnabled()
    const user = await requireRecentUser(ctx)
    await limitUserOperation(ctx, 'organizationWrite', user._id)
    return await ctx.runMutation(
      components.betterAuth.organizations.cancelInvitation,
      { ...input, actorId: user._id },
    )
  },
})

export const changeRole = mutation({
  args: {
    organizationId: v.string(),
    userId: v.string(),
    role: organizationRoleValidator,
  },
  returns: v.null(),
  handler: async (ctx, input) => {
    requireOrganizationsEnabled()
    const user = await requireRecentUser(ctx)
    await limitUserOperation(ctx, 'organizationWrite', user._id)
    await ctx.runMutation(components.betterAuth.organizations.changeRole, {
      ...input,
      actorId: user._id,
    })
    await ctx.db.insert('securityEvents', {
      event: 'organization.role_changed',
      organizationId: input.organizationId,
      actorId: user._id,
    })
    return null
  },
})

export const removeMember = mutation({
  args: { organizationId: v.string(), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, input) => {
    requireOrganizationsEnabled()
    const user = await requireRecentUser(ctx)
    await limitUserOperation(ctx, 'organizationWrite', user._id)
    await ctx.runMutation(components.betterAuth.organizations.removeMember, {
      ...input,
      actorId: user._id,
    })
    await ctx.db.insert('securityEvents', {
      event: 'organization.member_removed',
      organizationId: input.organizationId,
      actorId: user._id,
    })
    return null
  },
})

export const remove = mutation({
  args: { organizationId: v.string(), confirmation: v.literal('DELETE') },
  returns: v.null(),
  handler: async (ctx, { organizationId }) => {
    requireOrganizationsEnabled()
    const user = await requireRecentUser(ctx)
    await limitUserOperation(ctx, 'organizationWrite', user._id)
    await ctx.runMutation(components.betterAuth.organizations.remove, {
      organizationId,
      actorId: user._id,
    })
    await ctx.scheduler.runAfter(0, internal.cleanup.deletedOrganization, {
      organizationId,
    })
    await ctx.db.insert('securityEvents', { event: 'organization.deleted' })
    return null
  },
})

export const exportResources = query({
  args: { organizationId: v.string(), paginationOpts: paginationOptsValidator },
  returns: resourcePageValidator,
  handler: async (ctx, { organizationId, paginationOpts }) => {
    const user = await requireRecentUser(ctx)
    await requireOrganizationPermission(ctx, organizationId, user._id, 'manage')
    return await listOrganizationResources(ctx, organizationId, paginationOpts)
  },
})
