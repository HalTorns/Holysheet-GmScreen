import type { GenericCtx } from '@convex-dev/better-auth'
import { ConvexError } from 'convex/values'
import { RECENT_AUTH_MAX_AGE_SECONDS } from '../../shared/validation'
import { components } from '../_generated/api'
import type { DataModel } from '../_generated/dataModel'
import { authComponent } from '../auth'

export async function requireUser(ctx: GenericCtx<DataModel>) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity || typeof identity.sessionId !== 'string') {
    throw new ConvexError({ code: 'UNAUTHENTICATED' })
  }
  const user = await authComponent.getAuthUser(ctx)
  if (!user.emailVerified) throw new ConvexError({ code: 'UNAUTHENTICATED' })
  const session = await ctx.runQuery(
    components.betterAuth.lifecycle.getSession,
    {
      sessionId: identity.sessionId,
      userId: user._id,
    },
  )
  if (!session) throw new ConvexError({ code: 'UNAUTHENTICATED' })
  return user
}

export async function requireRecentUser(ctx: GenericCtx<DataModel>) {
  const user = await requireUser(ctx)
  const identity = await ctx.auth.getUserIdentity()
  if (!identity || typeof identity.sessionId !== 'string') {
    throw new ConvexError({ code: 'UNAUTHENTICATED' })
  }
  const session = await ctx.runQuery(
    components.betterAuth.lifecycle.getSession,
    {
      sessionId: identity.sessionId,
      userId: user._id,
    },
  )
  if (
    !session ||
    Date.now() - session.createdAt >= RECENT_AUTH_MAX_AGE_SECONDS * 1_000
  ) {
    throw new ConvexError({ code: 'REAUTHENTICATION_REQUIRED' })
  }
  return user
}
