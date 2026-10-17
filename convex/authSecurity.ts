import { ConvexError, v } from 'convex/values'

import { components } from './_generated/api'
import { internalMutation, query } from './_generated/server'
import { requireRecentUser } from './lib/auth'
import { getAuthModules } from './lib/authModules'
import { limitAuthRequest, limitUserOperation } from './lib/rateLimits'

export const consumeMfaAttempt = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await limitUserOperation(ctx, 'mfaVerification', userId)
    return null
  },
})

export const findSupportUser = query({
  args: { id: v.string() },
  returns: v.union(
    v.object({ id: v.string(), name: v.string(), email: v.string() }),
    v.null()
  ),
  handler: async (ctx, { id }) => {
    if (id.length > 128) throw new ConvexError({ code: 'INVALID_INPUT' })
    const user = await requireRecentUser(ctx)
    const modules = getAuthModules()
    if (
      user.twoFactorEnabled !== true ||
      !modules.AUTH_ADMIN_ENABLED ||
      !modules.ADMIN_USER_IDS.includes(user._id)
    )
      throw new ConvexError({ code: 'FORBIDDEN' })
    return ctx.runQuery(components.betterAuth.access.findUser, { id })
  },
})

// Only auth hooks supply the identity, after validating the presented cookie.
export const consumeAuthBudget = internalMutation({
  args: {
    bucket: v.union(
      v.literal('authSessionRead'),
      v.literal('authTokenRead'),
      v.literal('authEntry'),
      v.literal('authOther')
    ),
    key: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { bucket, key }) => {
    await limitAuthRequest(ctx, bucket, key)
    return null
  },
})

export const consumeIdentityAttempt = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await limitUserOperation(ctx, 'identityVerification', userId)
    return null
  },
})
