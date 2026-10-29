import { ConvexError, v } from 'convex/values'

import {
  MAX_ORGANIZATIONS_PER_USER,
  MAX_ORGANIZATION_MEMBERS,
  MAX_PENDING_INVITATIONS,
  MAX_RECIPIENT_INVITATIONS,
  organizationSchema,
  canManageOrganizationMembers,
} from '../../shared/organizations'
import {
  invitationRoleValidator,
  invitationValidator,
  memberValidator,
  organizationRoleValidator,
  organizationSummaryValidator,
} from '../lib/organizationValidators'
import { mutation, query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import {
  findMembership,
  getInvitation,
  getUser,
  parseRole,
  preserveOwner,
  requireMembership,
  requirePermission,
  revokeMemberInvitations,
} from './organizationAccess'

const organizationArgs = { organizationId: v.string(), actorId: v.string() }
const BATCH_SIZE = 100

async function assertMembershipCapacity(ctx: QueryCtx, userId: string) {
  const memberships = await ctx.db
    .query('member')
    .withIndex('userId', (q) => q.eq('userId', userId))
    .take(MAX_ORGANIZATIONS_PER_USER)
  if (memberships.length >= MAX_ORGANIZATIONS_PER_USER)
    throw new ConvexError({ code: 'ORGANIZATION_LIMIT' })
}

export const listMine = query({
  args: { userId: v.string() },
  returns: v.array(organizationSummaryValidator),
  handler: async (ctx, { userId }) => {
    const memberships = await ctx.db
      .query('member')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .take(MAX_ORGANIZATIONS_PER_USER)
    const result = []
    for (const membership of memberships) {
      const id = ctx.db.normalizeId('organization', membership.organizationId)
      const organization = id ? await ctx.db.get('organization', id) : null
      if (organization)
        result.push({
          id: organization._id,
          name: organization.name,
          role: parseRole(membership.role),
        })
    }
    return result
  },
})

export const authorize = query({
  args: {
    ...organizationArgs,
    permission: v.union(
      v.literal('read'),
      v.literal('write'),
      v.literal('manage'),
      v.literal('own')
    ),
  },
  returns: organizationSummaryValidator,
  handler: async (ctx, { organizationId, actorId, permission }) => {
    const { organization, role } = await requireMembership(
      ctx,
      organizationId,
      actorId
    )
    requirePermission(role, permission)
    return { id: organization._id, name: organization.name, role }
  },
})

export const get = query({
  args: organizationArgs,
  returns: v.object({
    organization: organizationSummaryValidator,
    members: v.array(memberValidator),
    invitations: v.array(invitationValidator),
  }),
  handler: async (ctx, { organizationId, actorId }) => {
    const { organization, role } = await requireMembership(
      ctx,
      organizationId,
      actorId
    )
    const memberships = await ctx.db
      .query('member')
      .withIndex('organizationId', (q) =>
        q.eq('organizationId', organizationId)
      )
      .take(MAX_ORGANIZATION_MEMBERS)
    const members = []
    for (const membership of memberships) {
      const user = await getUser(ctx, membership.userId)
      if (user)
        members.push({
          userId: user._id,
          name: user.name,
          email:
            canManageOrganizationMembers(role) || actorId === user._id
              ? user.email
              : '',
          role: parseRole(membership.role),
        })
    }
    const pending = canManageOrganizationMembers(role)
      ? await ctx.db
          .query('invitation')
          .withIndex('organizationId', (q) =>
            q.eq('organizationId', organizationId)
          )
          .take(MAX_PENDING_INVITATIONS)
      : []
    return {
      organization: { id: organization._id, name: organization.name, role },
      members,
      invitations: pending
        .filter(
          (invite) =>
            invite.status === 'pending' && invite.expiresAt > Date.now()
        )
        .map((invite) => ({
          id: invite._id,
          organizationId,
          organizationName: organization.name,
          email: invite.email,
          role: invitationRoleValidatorValue(invite.role),
          expiresAt: invite.expiresAt,
        })),
    }
  },
})

function invitationRoleValidatorValue(value: string | null | undefined) {
  const role = parseRole(value ?? '')
  if (role === 'owner') throw new ConvexError({ code: 'FORBIDDEN' })
  return role
}

export const create = mutation({
  args: { actorId: v.string(), name: v.string() },
  returns: v.string(),
  handler: () => {
    throw new ConvexError({ code: 'SURFACE_REMOVED' })
  },
})

export const rename = mutation({
  args: { ...organizationArgs, name: v.string() },
  returns: v.null(),
  handler: async (ctx, { organizationId, actorId, name }) => {
    const { organization, role } = await requireMembership(
      ctx,
      organizationId,
      actorId
    )
    requirePermission(role, 'manage')
    const parsed = organizationSchema.safeParse({ name })
    if (!parsed.success) throw new ConvexError({ code: 'INVALID_INPUT' })
    await ctx.db.patch('organization', organization._id, {
      name: parsed.data.name,
    })
    return null
  },
})

export const invite = mutation({
  args: {
    ...organizationArgs,
    email: v.string(),
    role: invitationRoleValidator,
  },
  returns: v.string(),
  handler: () => {
    throw new ConvexError({ code: 'SURFACE_REMOVED' })
  },
})

export const incoming = query({
  args: { email: v.string() },
  returns: v.array(invitationValidator),
  handler: async (ctx, { email }) => {
    const invitations = await ctx.db
      .query('invitation')
      .withIndex('email_status', (q) =>
        q.eq('email', email.toLowerCase()).eq('status', 'pending')
      )
      .take(MAX_RECIPIENT_INVITATIONS)
    const result = []
    for (const invitation of invitations) {
      if (invitation.expiresAt <= Date.now()) continue
      const id = ctx.db.normalizeId('organization', invitation.organizationId)
      const organization = id ? await ctx.db.get('organization', id) : null
      if (organization)
        result.push({
          id: invitation._id,
          organizationId: organization._id,
          organizationName: organization.name,
          email: invitation.email,
          role: invitationRoleValidatorValue(invitation.role),
          expiresAt: invitation.expiresAt,
        })
    }
    return result
  },
})

export const respond = mutation({
  args: {
    actorId: v.string(),
    email: v.string(),
    invitationId: v.string(),
    accept: v.boolean(),
  },
  returns: v.string(),
  handler: async (ctx, { actorId, email, invitationId, accept }) => {
    const invitation = await getInvitation(ctx, invitationId)
    if (invitation.email !== email.toLowerCase())
      throw new ConvexError({ code: 'NOT_FOUND' })
    if (!accept) {
      await ctx.db.delete('invitation', invitation._id)
      return invitation.organizationId
    }
    const id = ctx.db.normalizeId('organization', invitation.organizationId)
    if (!id || !(await ctx.db.get('organization', id)))
      throw new ConvexError({ code: 'NOT_FOUND' })
    // Invitations cannot outlive the inviter's current delegation rights.
    const inviter = await requireMembership(
      ctx,
      invitation.organizationId,
      invitation.inviterId
    )
    requirePermission(inviter.role, 'manage')
    if (inviter.role === 'admin' && invitation.role === 'admin')
      throw new ConvexError({ code: 'FORBIDDEN' })
    if (
      accept &&
      !(await findMembership(ctx, invitation.organizationId, actorId))
    ) {
      await assertMembershipCapacity(ctx, actorId)
      const members = await ctx.db
        .query('member')
        .withIndex('organizationId', (q) =>
          q.eq('organizationId', invitation.organizationId)
        )
        .take(MAX_ORGANIZATION_MEMBERS)
      if (members.length >= MAX_ORGANIZATION_MEMBERS)
        throw new ConvexError({ code: 'MEMBER_LIMIT' })
      await ctx.db.insert('member', {
        organizationId: invitation.organizationId,
        userId: actorId,
        role: invitationRoleValidatorValue(invitation.role),
        createdAt: Date.now(),
      })
    }
    await ctx.db.delete('invitation', invitation._id)
    return invitation.organizationId
  },
})

export const cancelInvitation = mutation({
  args: { actorId: v.string(), invitationId: v.string() },
  returns: v.null(),
  handler: async (ctx, { actorId, invitationId }) => {
    const invitation = await getInvitation(ctx, invitationId)
    const { role } = await requireMembership(
      ctx,
      invitation.organizationId,
      actorId
    )
    requirePermission(role, 'manage')
    if (role === 'admin' && invitation.role === 'admin')
      throw new ConvexError({ code: 'FORBIDDEN' })
    await ctx.db.delete('invitation', invitation._id)
    return null
  },
})

export const changeRole = mutation({
  args: {
    ...organizationArgs,
    userId: v.string(),
    role: organizationRoleValidator,
  },
  returns: v.null(),
  handler: async (ctx, { organizationId, actorId, userId, role: nextRole }) => {
    const { role } = await requireMembership(ctx, organizationId, actorId)
    requirePermission(role, 'manage')
    const target = await findMembership(ctx, organizationId, userId)
    if (!target) throw new ConvexError({ code: 'NOT_FOUND' })
    if (
      role === 'admin' &&
      (['owner', 'admin'].includes(target.role) ||
        ['owner', 'admin'].includes(nextRole))
    )
      throw new ConvexError({ code: 'FORBIDDEN' })
    if (nextRole !== 'owner') await preserveOwner(ctx, target)
    if (nextRole !== target.role)
      await revokeMemberInvitations(ctx, target, nextRole)
    await ctx.db.patch('member', target._id, { role: nextRole })
    return null
  },
})

export const removeMember = mutation({
  args: { ...organizationArgs, userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { organizationId, actorId, userId }) => {
    const { role } = await requireMembership(ctx, organizationId, actorId)
    const target = await findMembership(ctx, organizationId, userId)
    if (!target) throw new ConvexError({ code: 'NOT_FOUND' })
    if (actorId !== userId) {
      requirePermission(role, 'manage')
      if (role === 'admin' && ['owner', 'admin'].includes(target.role))
        throw new ConvexError({ code: 'FORBIDDEN' })
    }
    await preserveOwner(ctx, target)
    await revokeMemberInvitations(ctx, target)
    await ctx.db.delete('member', target._id)
    return null
  },
})

export const remove = mutation({
  args: organizationArgs,
  returns: v.null(),
  handler: async (ctx, { organizationId, actorId }) => {
    const { organization, role } = await requireMembership(
      ctx,
      organizationId,
      actorId
    )
    requirePermission(role, 'own')
    await ctx.db.delete('organization', organization._id)
    return null
  },
})

export const detachUser = mutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const memberships = await ctx.db
      .query('member')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .take(MAX_ORGANIZATIONS_PER_USER)
    for (const membership of memberships) {
      const id = ctx.db.normalizeId('organization', membership.organizationId)
      if (id && (await ctx.db.get('organization', id)))
        await preserveOwner(ctx, membership)
      await revokeMemberInvitations(ctx, membership)
      await ctx.db.delete('member', membership._id)
    }
    return null
  },
})

export const cleanupOrganization = mutation({
  args: { organizationId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { organizationId }) => {
    const members = await ctx.db
      .query('member')
      .withIndex('organizationId', (q) =>
        q.eq('organizationId', organizationId)
      )
      .take(BATCH_SIZE)
    const invitations = await ctx.db
      .query('invitation')
      .withIndex('organizationId', (q) =>
        q.eq('organizationId', organizationId)
      )
      .take(BATCH_SIZE)
    for (const member of members) await ctx.db.delete('member', member._id)
    for (const invitation of invitations)
      await ctx.db.delete('invitation', invitation._id)
    return members.length === BATCH_SIZE || invitations.length === BATCH_SIZE
  },
})

export const cleanupUserInvitations = mutation({
  args: { userId: v.string(), email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId, email }) => {
    const sent = await ctx.db
      .query('invitation')
      .withIndex('inviterId', (q) => q.eq('inviterId', userId))
      .take(BATCH_SIZE)
    const received = await ctx.db
      .query('invitation')
      .withIndex('email', (q) => q.eq('email', email.toLowerCase()))
      .take(BATCH_SIZE)
    for (const id of new Set(
      [...sent, ...received].map((invitation) => invitation._id)
    ))
      await ctx.db.delete('invitation', id)
    return sent.length === BATCH_SIZE || received.length === BATCH_SIZE
  },
})

export const cleanupExpiredInvitations = mutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query('invitation')
      .withIndex('expiresAt', (q) => q.lt('expiresAt', Date.now()))
      .take(BATCH_SIZE)
    for (const invitation of expired)
      await ctx.db.delete('invitation', invitation._id)
    return expired.length === BATCH_SIZE
  },
})
