import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'

const CLEANUP_BATCH_SIZE = 100
const AUTH_RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1_000

// Component functions are never directly exposed to the browser. Only the
// parent application calls these after validating the authenticated session.
export const getSession = query({
  args: { sessionId: v.string(), userId: v.string() },
  returns: v.union(
    v.null(),
    v.object({ createdAt: v.number(), expiresAt: v.number() }),
  ),
  handler: async (ctx, { sessionId, userId }) => {
    const id = ctx.db.normalizeId('session', sessionId)
    if (!id) return null
    const session = await ctx.db.get('session', id)
    if (
      !session ||
      session.userId !== userId ||
      session.expiresAt <= Date.now()
    )
      return null
    return { createdAt: session.createdAt, expiresAt: session.expiresAt }
  },
})

export const removePasskey = mutation({
  args: { userId: v.string(), passkeyId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, passkeyId }) => {
    const id = ctx.db.normalizeId('passkey', passkeyId)
    const key = id ? await ctx.db.get('passkey', id) : null
    if (!key || key.userId !== userId)
      throw new ConvexError({ code: 'NOT_FOUND' })
    const keys = await ctx.db
      .query('passkey')
      .withIndex('userId', (index) => index.eq('userId', userId))
      .take(2)
    if (keys.length < 2) throw new ConvexError({ code: 'LAST_PASSKEY' })
    await ctx.db.delete('passkey', key._id)
    return null
  },
})

export const deleteUser = mutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const id = ctx.db.normalizeId('user', userId)
    if (id) await ctx.db.delete('user', id)
    return null
  },
})

export const cleanupUserCredentials = mutation({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId }) => {
    const sessions = await ctx.db
      .query('session')
      .withIndex('userId', (index) => index.eq('userId', userId))
      .take(CLEANUP_BATCH_SIZE)
    const accounts = await ctx.db
      .query('account')
      .withIndex('userId', (index) => index.eq('userId', userId))
      .take(CLEANUP_BATCH_SIZE)
    const passkeys = await ctx.db
      .query('passkey')
      .withIndex('userId', (index) => index.eq('userId', userId))
      .take(CLEANUP_BATCH_SIZE)
    for (const session of sessions) await ctx.db.delete('session', session._id)
    for (const account of accounts) await ctx.db.delete('account', account._id)
    for (const key of passkeys) await ctx.db.delete('passkey', key._id)
    return [sessions, accounts, passkeys].some(
      (batch) => batch.length === CLEANUP_BATCH_SIZE,
    )
  },
})

export const cleanupExpired = mutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const sessions = await ctx.db
      .query('session')
      .withIndex('expiresAt', (index) => index.lt('expiresAt', Date.now()))
      .take(CLEANUP_BATCH_SIZE)
    const verifications = await ctx.db
      .query('verification')
      .withIndex('expiresAt', (index) => index.lt('expiresAt', Date.now()))
      .take(CLEANUP_BATCH_SIZE)
    const rateLimits = await ctx.db
      .query('rateLimit')
      .withIndex('lastRequest', (index) =>
        index.lt('lastRequest', Date.now() - AUTH_RATE_LIMIT_RETENTION_MS),
      )
      .take(CLEANUP_BATCH_SIZE)
    for (const session of sessions) await ctx.db.delete('session', session._id)
    for (const verification of verifications)
      await ctx.db.delete('verification', verification._id)
    for (const limit of rateLimits) await ctx.db.delete('rateLimit', limit._id)
    return [sessions, verifications, rateLimits].some(
      (batch) => batch.length === CLEANUP_BATCH_SIZE,
    )
  },
})
