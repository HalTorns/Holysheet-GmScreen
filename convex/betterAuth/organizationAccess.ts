import { ConvexError } from 'convex/values'
import {
  canManageOrganizationMembers,
  canWriteOrganizationResources,
  MAX_PENDING_INVITATIONS,
  organizationRoleSchema,
  type OrganizationRole,
} from '../../shared/organizations'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

export function parseRole(value: string): OrganizationRole {
  const parsed = organizationRoleSchema.safeParse(value)
  if (!parsed.success) throw new ConvexError({ code: 'FORBIDDEN' })
  return parsed.data
}

export async function requireMembership(
  ctx: QueryCtx,
  organizationId: string,
  userId: string,
) {
  const id = ctx.db.normalizeId('organization', organizationId)
  const organization = id ? await ctx.db.get('organization', id) : null
  if (!organization) throw new ConvexError({ code: 'NOT_FOUND' })
  const membership = await ctx.db
    .query('member')
    .withIndex('organizationId_userId', (q) =>
      q.eq('organizationId', organizationId).eq('userId', userId),
    )
    .unique()
  if (!membership) throw new ConvexError({ code: 'NOT_FOUND' })
  return { organization, membership, role: parseRole(membership.role) }
}

export function requirePermission(
  role: OrganizationRole,
  permission: 'read' | 'write' | 'manage' | 'own',
) {
  const allowed =
    permission === 'read' ||
    (permission === 'write' && canWriteOrganizationResources(role)) ||
    (permission === 'manage' && canManageOrganizationMembers(role)) ||
    (permission === 'own' && role === 'owner')
  if (!allowed) throw new ConvexError({ code: 'FORBIDDEN' })
}

export async function preserveOwner(ctx: QueryCtx, membership: Doc<'member'>) {
  if (membership.role !== 'owner') return
  const owners = await ctx.db
    .query('member')
    .withIndex('organizationId_role', (q) =>
      q.eq('organizationId', membership.organizationId).eq('role', 'owner'),
    )
    .take(2)
  if (owners.length < 2) throw new ConvexError({ code: 'LAST_OWNER' })
}

export async function getUser(ctx: QueryCtx, userId: string) {
  const id = ctx.db.normalizeId('user', userId)
  return id ? await ctx.db.get('user', id) : null
}

export async function revokeMemberInvitations(
  ctx: MutationCtx,
  membership: Doc<'member'>,
  nextRole?: OrganizationRole,
) {
  const issued = await ctx.db
    .query('invitation')
    .withIndex('organizationId_inviterId', (q) =>
      q
        .eq('organizationId', membership.organizationId)
        .eq('inviterId', membership.userId),
    )
    .take(MAX_PENDING_INVITATIONS)
  for (const invitation of issued) {
    const retainsDelegation =
      nextRole !== undefined &&
      canManageOrganizationMembers(nextRole) &&
      (invitation.role !== 'admin' || nextRole === 'owner')
    if (!retainsDelegation) await ctx.db.delete('invitation', invitation._id)
  }
  // Legacy invitations to existing members must never undo a role change or removal.
  const user = await getUser(ctx, membership.userId)
  if (!user) return
  const received = await ctx.db
    .query('invitation')
    .withIndex('organizationId_email', (q) =>
      q
        .eq('organizationId', membership.organizationId)
        .eq('email', user.email.toLowerCase()),
    )
    .take(MAX_PENDING_INVITATIONS)
  for (const invitation of received)
    await ctx.db.delete('invitation', invitation._id)
}

export async function findMembership(
  ctx: QueryCtx,
  organizationId: string,
  userId: string,
) {
  return await ctx.db
    .query('member')
    .withIndex('organizationId_userId', (q) =>
      q.eq('organizationId', organizationId).eq('userId', userId),
    )
    .unique()
}

export async function getInvitation(ctx: QueryCtx, invitationId: string) {
  const id = ctx.db.normalizeId('invitation', invitationId)
  const invitation = id ? await ctx.db.get('invitation', id) : null
  if (
    !invitation ||
    invitation.status !== 'pending' ||
    invitation.expiresAt <= Date.now()
  )
    throw new ConvexError({ code: 'INVITATION_EXPIRED' })
  return invitation
}
