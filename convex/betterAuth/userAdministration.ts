import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { displayNameKey } from '../../shared/validation'
import { z } from '../../shared/zod'
import {
  managedUser,
  managedUsersPage,
  managedSessions,
  moderationChange,
  ownAccountStatus,
} from '../lib/userAdminValidators'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { internalMutation, mutation, query } from './_generated/server'
import type { QueryCtx, MutationCtx } from './_generated/server'
import { isBanned, sessionAccess } from './access'

const authority = { actorId: v.string(), sessionId: v.string() }
const SESSION_PREVIEW_SIZE = 20
const SESSION_SCAN_LIMIT = 100
async function requireActor(
  ctx: QueryCtx,
  args: { actorId: string; sessionId: string }
) {
  const actorId = ctx.db.normalizeId('user', args.actorId)
  const sessionId = ctx.db.normalizeId('session', args.sessionId)
  const actor = actorId ? await ctx.db.get('user', actorId) : null
  const session = sessionId ? await ctx.db.get('session', sessionId) : null
  const access =
    actor && session && session.userId === actor._id
      ? await sessionAccess(ctx, session, actor)
      : null
  if (
    !actor ||
    !actor.emailVerified ||
    actor.role !== 'admin' ||
    !access?.mfaVerified ||
    access.impersonatedBy
  )
    throw new ConvexError({ code: 'FORBIDDEN' })
  return actor
}
async function findUser(ctx: QueryCtx, id: string) {
  const userId = ctx.db.normalizeId('user', id)
  const user = userId ? await ctx.db.get('user', userId) : null
  if (!user) throw new ConvexError({ code: 'NOT_FOUND' })
  return user
}
function summary(user: Doc<'user'>) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role === 'admin' ? ('admin' as const) : ('user' as const),
    banned: isBanned(user),
    banReason: user.banReason ?? null,
    banExpires: user.banExpires ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    adminVersion: user.adminVersion ?? 0,
  }
}
const cursorSchema = z.object({
  at: z.number(),
  id: z.string(),
  key: z.string(),
  query: z.string(),
})
export const list = query({
  args: {
    ...authority,
    search: v.string(),
    field: v.optional(v.union(v.literal('email'), v.literal('name'))),
    role: v.optional(v.union(v.literal('user'), v.literal('admin'))),
    paginationOpts: paginationOptsValidator,
  },
  returns: managedUsersPage,
  handler: async (ctx, args) => {
    await requireActor(ctx, args)
    const size = args.paginationOpts.numItems
    const search = displayNameKey(args.search)
    if (search.length > 100 || !Number.isInteger(size) || size < 1 || size > 30)
      throw new ConvexError({ code: 'INVALID_INPUT' })
    const field = args.field === 'name' && search ? 'nameKey' : 'email'
    const signature = JSON.stringify([field, search, args.role ?? 'all'])
    let cursor: z.infer<typeof cursorSchema> | null = null
    try {
      if (args.paginationOpts.cursor) {
        if (args.paginationOpts.cursor.length > 2000)
          throw new Error('Invalid cursor')
        cursor = cursorSchema.parse(JSON.parse(args.paginationOpts.cursor))
        if (cursor.query !== signature) throw new Error('Invalid cursor')
      }
    } catch {
      throw new ConvexError({ code: 'INVALID_INPUT' })
    }
    const after = cursor ? ctx.db.normalizeId('user', cursor.id) : null
    if (cursor && !after) throw new ConvexError({ code: 'INVALID_INPUT' })
    const upper = `${search}\u{10FFFF}`
    const role = args.role
    const sameKey = cursor
      ? role
        ? field === 'nameKey'
          ? ctx.db
              .query('user')
              .withIndex('by_role_name', (q) =>
                q
                  .eq('role', role)
                  .eq('nameKey', cursor.key)
                  .gte('_creationTime', cursor.at)
              )
          : ctx.db
              .query('user')
              .withIndex('by_role_email', (q) =>
                q
                  .eq('role', role)
                  .eq('email', cursor.key)
                  .gte('_creationTime', cursor.at)
              )
        : field === 'nameKey'
          ? ctx.db
              .query('user')
              .withIndex('nameKey', (q) =>
                q.eq('nameKey', cursor.key).gte('_creationTime', cursor.at)
              )
          : ctx.db
              .query('user')
              .withIndex('search_email', (q) =>
                q.eq('email', cursor.key).gte('_creationTime', cursor.at)
              )
      : null
    const equalRows =
      sameKey && cursor && after
        ? await sameKey
            .filter((q) =>
              q.or(
                q.gt(q.field('_creationTime'), cursor.at),
                q.and(
                  q.eq(q.field('_creationTime'), cursor.at),
                  q.gt(q.field('_id'), after)
                )
              )
            )
            .take(size + 1)
        : []
    const lower = cursor?.key ?? search
    const collection = role
      ? field === 'nameKey'
        ? ctx.db.query('user').withIndex('by_role_name', (q) => {
            const index = q.eq('role', role)
            return cursor
              ? index.gt('nameKey', lower).lt('nameKey', upper)
              : index.gte('nameKey', lower).lt('nameKey', upper)
          })
        : ctx.db.query('user').withIndex('by_role_email', (q) => {
            const index = q.eq('role', role)
            return cursor
              ? index.gt('email', lower).lt('email', upper)
              : index.gte('email', lower).lt('email', upper)
          })
      : field === 'nameKey'
        ? ctx.db
            .query('user')
            .withIndex('nameKey', (q) =>
              cursor
                ? q.gt('nameKey', lower).lt('nameKey', upper)
                : q.gte('nameKey', lower).lt('nameKey', upper)
            )
        : ctx.db
            .query('user')
            .withIndex('search_email', (q) =>
              cursor
                ? q.gt('email', lower).lt('email', upper)
                : q.gte('email', lower).lt('email', upper)
            )
    const rows =
      equalRows.length > size
        ? equalRows
        : [
            ...equalRows,
            ...(await collection.take(size + 1 - equalRows.length)),
          ]
    const page = rows.slice(0, size)
    const last = page.at(-1)
    return {
      page: page.map(summary),
      isDone: rows.length <= size,
      continueCursor: last
        ? JSON.stringify({
            at: last._creationTime,
            id: last._id,
            key: last[field] ?? '',
            query: signature,
          })
        : '',
    }
  },
})
export const read = query({
  args: { ...authority, targetId: v.string() },
  returns: managedUser,
  handler: async (ctx, args) => {
    await requireActor(ctx, args)
    return summary(await findUser(ctx, args.targetId))
  },
})
export const sessions = query({
  args: { ...authority, targetId: v.string() },
  returns: managedSessions,
  handler: async (ctx, args) => {
    await requireActor(ctx, args)
    await findUser(ctx, args.targetId)
    const cutoff = await ctx.db
      .query('sessionRevocations')
      .withIndex('by_user', (q) => q.eq('userId', args.targetId))
      .unique()
    // Bound database reads before filtering expiry: take after a database
    // filter would scan arbitrarily many expired sessions to find 21 matches.
    const candidates = await ctx.db
      .query('session')
      .withIndex('userId_createdAt', (q) =>
        q.eq('userId', args.targetId).gt('createdAt', cutoff?.revokedAt ?? 0)
      )
      .order('desc')
      .take(SESSION_SCAN_LIMIT)
    const rows = candidates.filter((row) => row.expiresAt > Date.now())
    return {
      page: rows.slice(0, SESSION_PREVIEW_SIZE).map((row) => ({
        id: row._id,
        userAgent: row.userAgent ?? null,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      })),
      hasMore:
        rows.length > SESSION_PREVIEW_SIZE ||
        candidates.length === SESSION_SCAN_LIMIT,
    }
  },
})
async function protectLastAdmin(ctx: QueryCtx, target: Doc<'user'>) {
  if (target.role !== 'admin' || !target.emailVerified || isBanned(target))
    return
  const admins = await ctx.db
    .query('user')
    .withIndex('role', (q) => q.eq('role', 'admin'))
    .take(101)
  if (
    !admins.some(
      (user) => user._id !== target._id && user.emailVerified && !isBanned(user)
    )
  )
    throw new ConvexError({ code: 'LAST_ADMIN' })
}
async function revokeSessions(ctx: MutationCtx, userId: string) {
  const existing = await ctx.db
    .query('sessionRevocations')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
  const revokedAt = Math.max(Date.now(), existing?.revokedAt ?? 0)
  const value = {
    userId,
    revokedAt,
    expiresAt: Date.now() + 8 * 24 * 60 * 60 * 1000,
  }
  if (existing) await ctx.db.replace('sessionRevocations', existing._id, value)
  else await ctx.db.insert('sessionRevocations', value)
  await ctx.scheduler.runAfter(0, internal.userAdministration.cleanupSessions, {
    userId,
    revokedAt,
  })
}
export const apply = mutation({
  args: {
    ...authority,
    targetId: v.string(),
    expectedVersion: v.number(),
    change: moderationChange,
  },
  returns: managedUser,
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args)
    const target = await findUser(ctx, args.targetId)
    if ((target.adminVersion ?? 0) !== args.expectedVersion)
      throw new ConvexError({ code: 'CONFLICT' })
    const change = args.change
    if (
      (change.kind === 'role' && change.role === 'user') ||
      change.kind === 'ban'
    )
      await protectLastAdmin(ctx, target)
    const update: Partial<Doc<'user'>> = {
      updatedAt: Date.now(),
      adminVersion: (target.adminVersion ?? 0) + 1,
    }
    let event: Doc<'authAudit'>['event']
    if (change.kind === 'role') {
      if (change.role === 'admin' && target.role !== 'admin') {
        const existing = await ctx.db
          .query('user')
          .withIndex('role', (q) => q.eq('role', 'admin'))
          .take(100)
        if (existing.length === 100)
          throw new ConvexError({ code: 'ADMIN_LIMIT' })
      }
      update.role = change.role
      event =
        change.role === 'admin' ? 'admin.role.granted' : 'admin.role.removed'
    } else if (change.kind === 'ban') {
      if (actor._id === target._id)
        throw new ConvexError({ code: 'SELF_MODERATION' })
      const reason = change.reason.trim()
      if (!reason || reason.length > 1000)
        throw new ConvexError({ code: 'INVALID_INPUT' })
      Object.assign(update, {
        banned: true,
        banReason: reason,
        banExpires:
          change.days === null
            ? null
            : Date.now() + change.days * 24 * 60 * 60 * 1000,
      })
      await revokeSessions(ctx, target._id)
      event = 'admin.user.suspended'
    } else if (change.kind === 'unban') {
      Object.assign(update, {
        banned: false,
        banReason: null,
        banExpires: null,
      })
      event = 'admin.user.restored'
    } else {
      if (actor._id === target._id)
        throw new ConvexError({ code: 'SELF_MODERATION' })
      await revokeSessions(ctx, target._id)
      event = 'admin.sessions.revoked'
    }
    await ctx.db.patch('user', target._id, update)
    await ctx.db.insert('authAudit', {
      event,
      actorId: actor._id,
      targetId: target._id,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    })
    return summary(await findUser(ctx, target._id))
  },
})
export const cleanupSessions = internalMutation({
  args: { userId: v.string(), revokedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('session')
      .withIndex('userId_createdAt', (q) =>
        q.eq('userId', args.userId).lte('createdAt', args.revokedAt)
      )
      .take(100)
    for (const row of rows) {
      const proof = await ctx.db
        .query('sessionAssurances')
        .withIndex('by_session', (q) => q.eq('sessionId', row._id))
        .unique()
      if (proof) await ctx.db.delete('sessionAssurances', proof._id)
      await ctx.db.delete('session', row._id)
    }
    if (rows.length === 100)
      await ctx.scheduler.runAfter(
        0,
        internal.userAdministration.cleanupSessions,
        args
      )
    return null
  },
})
export const status = query({
  args: { userId: v.string() },
  returns: ownAccountStatus,
  handler: async (ctx, args) => {
    const user = await findUser(ctx, args.userId)
    const cutoff = await ctx.db
      .query('sessionRevocations')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique()
    const { role, banned, banReason, banExpires } = summary(user)
    return {
      role,
      banned,
      banReason,
      banExpires,
      sessionsRevokedAt: cutoff?.revokedAt ?? null,
    }
  },
})
export const grant = mutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await findUser(ctx, args.userId)
    if (!user.emailVerified || isBanned(user))
      throw new ConvexError({ code: 'FORBIDDEN' })
    if (user.role !== 'admin') {
      const admins = await ctx.db
        .query('user')
        .withIndex('role', (q) => q.eq('role', 'admin'))
        .take(100)
      if (admins.length >= 100) throw new ConvexError({ code: 'ADMIN_LIMIT' })
    }
    await ctx.db.insert('authAudit', {
      event: 'operator.admin.granted',
      actorId: 'operator',
      targetId: user._id,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    })
    await ctx.db.patch('user', user._id, {
      role: 'admin',
      updatedAt: Date.now(),
      adminVersion: (user.adminVersion ?? 0) + 1,
    })
    return null
  },
})
export async function ensureAnotherAdmin(ctx: QueryCtx, user: Doc<'user'>) {
  await protectLastAdmin(ctx, user)
}
