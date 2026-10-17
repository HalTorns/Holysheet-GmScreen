import { ConvexError, v } from 'convex/values'

import { identityOperationSchema } from '../../shared/identity-confirmation'
import { mutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import { sessionAccess } from './access'

async function requireSession(
  ctx: MutationCtx,
  args: { userId: string; sessionId: string }
) {
  const sessionId = ctx.db.normalizeId('session', args.sessionId)
  const userId = ctx.db.normalizeId('user', args.userId)
  const session = sessionId ? await ctx.db.get('session', sessionId) : null
  const user = userId ? await ctx.db.get('user', userId) : null
  const access =
    session && user && session.userId === user._id
      ? await sessionAccess(ctx, session, user)
      : null
  if (!access?.mfaVerified || access.impersonatedBy)
    throw new ConvexError({ code: 'UNAUTHENTICATED' })
}
const authority = {
  userId: v.string(),
  sessionId: v.string(),
  operation: v.string(),
}
export const issue = mutation({
  args: { ...authority, digest: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSession(ctx, args)
    if (!identityOperationSchema.safeParse(args.operation).success)
      throw new ConvexError({ code: 'INVALID_INPUT' })
    const previous = await ctx.db
      .query('identityChallenges')
      .withIndex('by_session_operation', (q) =>
        q.eq('sessionId', args.sessionId).eq('operation', args.operation)
      )
      .unique()
    const value = {
      ...args,
      attempts: 0,
      verified: false,
      expiresAt: Date.now() + 300_000,
    }
    if (previous)
      await ctx.db.replace('identityChallenges', previous._id, value)
    else await ctx.db.insert('identityChallenges', value)
    return null
  },
})
export const verify = mutation({
  args: { ...authority, digest: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await requireSession(ctx, args)
    const proof = await ctx.db
      .query('identityChallenges')
      .withIndex('by_session_operation', (q) =>
        q.eq('sessionId', args.sessionId).eq('operation', args.operation)
      )
      .unique()
    if (
      !proof ||
      proof.userId !== args.userId ||
      proof.expiresAt <= Date.now() ||
      proof.attempts >= 3 ||
      proof.verified
    )
      return false
    // Return a failure so that the failed attempt commits instead of rolling back.
    await ctx.db.patch('identityChallenges', proof._id, {
      attempts: proof.attempts + 1,
      verified: proof.digest === args.digest,
    })
    return proof.digest === args.digest
  },
})
export const consume = mutation({
  args: authority,
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSession(ctx, args)
    const proof = await ctx.db
      .query('identityChallenges')
      .withIndex('by_session_operation', (q) =>
        q.eq('sessionId', args.sessionId).eq('operation', args.operation)
      )
      .unique()
    if (
      !proof ||
      proof.userId !== args.userId ||
      !proof.verified ||
      proof.expiresAt <= Date.now()
    )
      throw new ConvexError({ code: 'IDENTITY_CONFIRMATION_REQUIRED' })
    await ctx.db.delete('identityChallenges', proof._id)
    return null
  },
})
