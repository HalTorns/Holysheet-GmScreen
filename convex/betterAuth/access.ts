import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { z } from '../../shared/zod'
import type { Doc } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import type { QueryCtx, MutationCtx } from './_generated/server'

export const exportAudit = query({
  args: {
    userId: v.string(),
    scope: v.union(v.literal('actor'), v.literal('target')),
    paginationOpts: paginationOptsValidator,
  },
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
    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 100
    )
      throw new ConvexError({ code: 'INVALID_INPUT' })
    // Native Convex pagination is unavailable inside components. Use an indexed
    // keyset cursor with ID tie-breaking; cleanup between pages does not invalidate it.
    const cursorSchema = z.object({
      at: z.number().nonnegative(),
      id: z.string(),
    })
    let cursor: z.infer<typeof cursorSchema> | null = null
    try {
      if (args.paginationOpts.cursor)
        cursor = cursorSchema.parse(JSON.parse(args.paginationOpts.cursor))
    } catch {
      throw new ConvexError({ code: 'INVALID_INPUT' })
    }
    const after = cursor ? ctx.db.normalizeId('authAudit', cursor.id) : null
    if (cursor && !after) throw new ConvexError({ code: 'INVALID_INPUT' })
    const at = cursor?.at ?? 0
    const collection =
      args.scope === 'actor'
        ? ctx.db
            .query('authAudit')
            .withIndex('by_actor', (q) =>
              q.eq('actorId', args.userId).gte('_creationTime', at)
            )
        : ctx.db
            .query('authAudit')
            .withIndex('by_target', (q) =>
              q.eq('targetId', args.userId).gte('_creationTime', at)
            )
    const filtered = after
      ? collection.filter((q) =>
          q.or(
            q.gt(q.field('_creationTime'), at),
            q.and(
              q.eq(q.field('_creationTime'), at),
              q.gt(q.field('_id'), after)
            )
          )
        )
      : collection
    const rows = await filtered.take(args.paginationOpts.numItems + 1)
    const page = rows.slice(0, args.paginationOpts.numItems)
    const last = page.at(-1)
    return {
      page: page.map((row) => ({
        event: row.event,
        actorId: row.actorId,
        createdAt: row._creationTime,
      })),
      isDone: rows.length <= args.paginationOpts.numItems,
      continueCursor: last
        ? JSON.stringify({ at: last._creationTime, id: last._id })
        : '',
    }
  },
})

export const sessionAccessValidator = v.object({
  createdAt: v.number(),
  expiresAt: v.number(),
  mfaRequired: v.boolean(),
  mfaVerified: v.boolean(),
  impersonatedBy: v.union(v.string(), v.null()),
})

export function isBanned(user: Doc<'user'>) {
  return (
    user.banned === true && (!user.banExpires || user.banExpires > Date.now())
  )
}

export async function sessionAccess(
  ctx: QueryCtx,
  session: Doc<'session'>,
  user: Doc<'user'>
) {
  const cutoff = await ctx.db
    .query('sessionRevocations')
    .withIndex('by_user', (q) => q.eq('userId', user._id))
    .unique()
  if (
    session.expiresAt <= Date.now() ||
    isBanned(user) ||
    (cutoff && session.createdAt <= cutoff.revokedAt)
  )
    return null
  if (session.impersonatedBy) return null
  const factor = user.twoFactorEnabled
    ? await ctx.db
        .query('twoFactor')
        .withIndex('userId', (q) => q.eq('userId', user._id))
        .first()
    : null
  const assurance = user.twoFactorEnabled
    ? await ctx.db
        .query('sessionAssurances')
        .withIndex('by_session', (q) => q.eq('sessionId', session._id))
        .unique()
    : null
  return {
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    mfaRequired: user.twoFactorEnabled === true,
    mfaVerified:
      !user.twoFactorEnabled ||
      Boolean(
        factor &&
        factor.verified !== false &&
        assurance?.factorId === factor._id &&
        assurance.expiresAt > Date.now()
      ),
    impersonatedBy: session.impersonatedBy ?? null,
  }
}

export const getSession = query({
  args: { sessionId: v.string(), userId: v.string() },
  returns: v.union(sessionAccessValidator, v.null()),
  handler: async (ctx, args) => {
    const sessionId = ctx.db.normalizeId('session', args.sessionId)
    const userId = ctx.db.normalizeId('user', args.userId)
    const session = sessionId ? await ctx.db.get('session', sessionId) : null
    const user = userId ? await ctx.db.get('user', userId) : null
    if (!session || !user || session.userId !== user._id) return null
    return sessionAccess(ctx, session, user)
  },
})

export const verifySessionFactor = mutation({
  args: { sessionId: v.string(), userId: v.string(), factorId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sessionId = ctx.db.normalizeId('session', args.sessionId)
    const session = sessionId ? await ctx.db.get('session', sessionId) : null
    const factor = await ctx.db
      .query('twoFactor')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .first()
    if (
      !session ||
      session.userId !== args.userId ||
      session.impersonatedBy ||
      session.expiresAt <= Date.now() ||
      !factor ||
      factor._id !== args.factorId ||
      factor.verified === false
    )
      throw new ConvexError({ code: 'UNAUTHENTICATED' })
    const previous = await ctx.db
      .query('sessionAssurances')
      .withIndex('by_session', (q) => q.eq('sessionId', session._id))
      .unique()
    const value = {
      sessionId: session._id,
      userId: args.userId,
      factorId: factor._id,
      verifiedAt: Date.now(),
      expiresAt: session.expiresAt,
    }
    if (previous?.previousSessionId)
      await deletePreviousSession(ctx, previous.previousSessionId, args.userId)
    if (previous) await ctx.db.replace('sessionAssurances', previous._id, value)
    else await ctx.db.insert('sessionAssurances', value)
    await ctx.db.insert('authAudit', {
      event: 'mfa.verified',
      actorId: args.userId,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    })
    return null
  },
})

export const currentFactor = query({
  args: { userId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { userId }) =>
    (
      await ctx.db
        .query('twoFactor')
        .withIndex('userId', (q) => q.eq('userId', userId))
        .first()
    )?._id ?? null,
})

export const recordImpersonation = mutation({
  args: {
    sessionId: v.string(),
    actorSessionId: v.string(),
    actorId: v.string(),
    targetId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sessionId = ctx.db.normalizeId('session', args.sessionId)
    const actorSessionId = ctx.db.normalizeId('session', args.actorSessionId)
    const session = sessionId ? await ctx.db.get('session', sessionId) : null
    const actorSession = actorSessionId
      ? await ctx.db.get('session', actorSessionId)
      : null
    if (
      !session ||
      !actorSession ||
      session.impersonatedBy !== args.actorId ||
      session.userId !== args.targetId ||
      actorSession.userId !== args.actorId ||
      actorSession.impersonatedBy ||
      actorSession.expiresAt <= Date.now()
    )
      throw new ConvexError({ code: 'UNAUTHENTICATED' })
    const existing = await ctx.db
      .query('impersonations')
      .withIndex('by_session', (q) => q.eq('sessionId', session._id))
      .unique()
    if (!existing)
      await ctx.db.insert('impersonations', {
        sessionId: session._id,
        actorSessionId: actorSession._id,
        actorId: args.actorId,
        targetId: args.targetId,
        expiresAt: session.expiresAt,
      })
    await ctx.db.insert('authAudit', {
      event: 'admin.impersonated',
      actorId: args.actorId,
      targetId: args.targetId,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    })
    return null
  },
})

export const findUser = query({
  args: { id: v.string() },
  returns: v.union(
    v.object({ id: v.string(), name: v.string(), email: v.string() }),
    v.null()
  ),
  handler: async (ctx, { id }) => {
    const userId = ctx.db.normalizeId('user', id)
    const user = userId ? await ctx.db.get('user', userId) : null
    return user ? { id: user._id, name: user.name, email: user.email } : null
  },
})

// Only the server hook supplies IDs obtained from verified session cookies.
export const replaceSession = mutation({
  args: { previousId: v.string(), sessionId: v.string(), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const oldId = ctx.db.normalizeId('session', args.previousId)
    const newId = ctx.db.normalizeId('session', args.sessionId)
    const previous = oldId ? await ctx.db.get('session', oldId) : null
    const current = newId ? await ctx.db.get('session', newId) : null
    if (
      !previous ||
      !current ||
      previous._id === current._id ||
      previous.userId !== args.userId ||
      current.userId !== args.userId ||
      previous.impersonatedBy ||
      current.impersonatedBy
    )
      return null
    const userId = ctx.db.normalizeId('user', args.userId)
    const user = userId ? await ctx.db.get('user', userId) : null
    const access = user ? await sessionAccess(ctx, current, user) : null
    if (!access) return null
    if (!access.mfaVerified) {
      // A successful first factor must not retire a verified session before
      // the new session independently proves its own second factor.
      const pending = await ctx.db
        .query('sessionAssurances')
        .withIndex('by_session', (q) => q.eq('sessionId', current._id))
        .unique()
      const predecessor = await ctx.db
        .query('sessionAssurances')
        .withIndex('by_session', (q) => q.eq('sessionId', previous._id))
        .unique()
      // Repeated first-factor attempts must still retire the original verified
      // session after MFA succeeds. Discard the intermediate pending session.
      const previousSessionId = predecessor?.previousSessionId ?? previous._id
      if (predecessor?.previousSessionId)
        await deletePreviousSession(ctx, previous._id, args.userId)
      const value = {
        sessionId: current._id,
        userId: args.userId,
        previousSessionId,
        verifiedAt: 0,
        expiresAt: current.expiresAt,
      }
      if (pending) await ctx.db.replace('sessionAssurances', pending._id, value)
      else await ctx.db.insert('sessionAssurances', value)
      return null
    }
    await deletePreviousSession(ctx, previous._id, args.userId)
    return null
  },
})

async function deletePreviousSession(
  ctx: MutationCtx,
  previousId: Doc<'session'>['_id'],
  userId: string
) {
  const previous = await ctx.db.get('session', previousId)
  if (!previous || previous.userId !== userId || previous.impersonatedBy) return
  const proof = await ctx.db
    .query('sessionAssurances')
    .withIndex('by_session', (q) => q.eq('sessionId', previousId))
    .unique()
  if (proof) await ctx.db.delete('sessionAssurances', proof._id)
  await ctx.db.delete('session', previousId)
}

// The HTTP endpoint also requires possession of a signed, flow-bound backup
// cookie. The pending session/link alone must never grant an MFA assurance.
export const cancelPendingSignIn = mutation({
  args: {
    userId: v.string(),
    sessionId: v.string(),
    previousId: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId('session', args.sessionId)
    const userId = ctx.db.normalizeId('user', args.userId)
    const current = id ? await ctx.db.get('session', id) : null
    const user = userId ? await ctx.db.get('user', userId) : null
    const currentAccess =
      current && user && current.userId === user._id
        ? await sessionAccess(ctx, current, user)
        : null
    if (
      !current ||
      !user ||
      !currentAccess ||
      currentAccess.mfaVerified ||
      currentAccess.impersonatedBy
    )
      throw new ConvexError({ code: 'UNAUTHENTICATED' })
    const pending = await ctx.db
      .query('sessionAssurances')
      .withIndex('by_session', (q) => q.eq('sessionId', current._id))
      .unique()
    const previousId = args.previousId
      ? ctx.db.normalizeId('session', args.previousId)
      : null
    const previous = previousId ? await ctx.db.get('session', previousId) : null
    const access =
      previous && user && previous.userId === user._id
        ? await sessionAccess(ctx, previous, user)
        : null
    const restored = Boolean(
      previous &&
      pending?.previousSessionId === previous._id &&
      access?.mfaVerified &&
      !access.impersonatedBy
    )
    if (pending) await ctx.db.delete('sessionAssurances', pending._id)
    await ctx.db.delete('session', current._id)
    return restored
  },
})
