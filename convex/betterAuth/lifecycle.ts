import { ConvexError, v } from 'convex/values'

import { mutation } from './_generated/server'

const CLEANUP_BATCH_SIZE = 100
const AUTH_RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000

// Component functions are never directly exposed to the browser. Only the
// parent application calls these after validating the authenticated session.
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
    const factors = await ctx.db
      .query('twoFactor')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .take(CLEANUP_BATCH_SIZE)
    const assurances = await ctx.db
      .query('sessionAssurances')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(CLEANUP_BATCH_SIZE)
    const actorLinks = await ctx.db
      .query('impersonations')
      .withIndex('by_actor', (q) => q.eq('actorId', userId))
      .take(CLEANUP_BATCH_SIZE)
    const targetLinks = await ctx.db
      .query('impersonations')
      .withIndex('by_target', (q) => q.eq('targetId', userId))
      .take(CLEANUP_BATCH_SIZE)
    const actorAudit = await ctx.db
      .query('authAudit')
      .withIndex('by_actor', (q) => q.eq('actorId', userId))
      .take(CLEANUP_BATCH_SIZE)
    const targetAudit = await ctx.db
      .query('authAudit')
      .withIndex('by_target', (q) => q.eq('targetId', userId))
      .take(CLEANUP_BATCH_SIZE)
    for (const row of factors) await ctx.db.delete('twoFactor', row._id)
    for (const row of assurances)
      await ctx.db.delete('sessionAssurances', row._id)
    for (const row of [...actorLinks, ...targetLinks])
      await ctx.db.delete('impersonations', row._id)
    for (const row of [...actorAudit, ...targetAudit])
      await ctx.db.delete('authAudit', row._id)
    for (const session of sessions) await ctx.db.delete('session', session._id)
    for (const account of accounts) await ctx.db.delete('account', account._id)
    for (const key of passkeys) await ctx.db.delete('passkey', key._id)
    return [
      sessions,
      accounts,
      passkeys,
      factors,
      assurances,
      actorLinks,
      targetLinks,
      actorAudit,
      targetAudit,
    ].some((batch) => batch.length === CLEANUP_BATCH_SIZE)
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
        index.lt('lastRequest', Date.now() - AUTH_RATE_LIMIT_RETENTION_MS)
      )
      .take(CLEANUP_BATCH_SIZE)
    const assurances = await ctx.db
      .query('sessionAssurances')
      .withIndex('by_expiry', (q) => q.lt('expiresAt', Date.now()))
      .take(CLEANUP_BATCH_SIZE)
    const links = await ctx.db
      .query('impersonations')
      .withIndex('by_expiry', (q) => q.lt('expiresAt', Date.now()))
      .take(CLEANUP_BATCH_SIZE)
    const audit = await ctx.db
      .query('authAudit')
      .withIndex('by_expiry', (q) => q.lt('expiresAt', Date.now()))
      .take(CLEANUP_BATCH_SIZE)
    for (const row of assurances)
      await ctx.db.delete('sessionAssurances', row._id)
    for (const row of links) await ctx.db.delete('impersonations', row._id)
    for (const row of audit) await ctx.db.delete('authAudit', row._id)
    for (const session of sessions) await ctx.db.delete('session', session._id)
    for (const verification of verifications)
      await ctx.db.delete('verification', verification._id)
    for (const limit of rateLimits) await ctx.db.delete('rateLimit', limit._id)
    return [sessions, verifications, rateLimits, assurances, links, audit].some(
      (batch) => batch.length === CLEANUP_BATCH_SIZE
    )
  },
})
