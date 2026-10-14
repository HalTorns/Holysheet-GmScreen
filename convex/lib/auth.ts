import type { GenericCtx } from '@convex-dev/better-auth'
import { ConvexError } from 'convex/values'

import { RECENT_AUTH_MAX_AGE_SECONDS } from '../../shared/validation'
import type { DataModel } from '../_generated/dataModel'
import { authComponent } from '../auth'
import { getSessionAccess } from './sessionAccess'

export async function requireUser(ctx: GenericCtx<DataModel>) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity || typeof identity.sessionId !== 'string') {
    throw new ConvexError({ code: 'UNAUTHENTICATED' })
  }
  const user = await authComponent.getAuthUser(ctx)
  if (!user.emailVerified) throw new ConvexError({ code: 'UNAUTHENTICATED' })
  const session = await getSessionAccess(ctx, identity.sessionId, user._id)
  if (!session) throw new ConvexError({ code: 'UNAUTHENTICATED' })
  if (!session.mfaVerified) throw new ConvexError({ code: 'MFA_REQUIRED' })
  if (session.impersonatedBy && 'scheduler' in ctx)
    throw new ConvexError({ code: 'IMPERSONATION_READ_ONLY' })
  return user
}

export async function requireRecentUser(ctx: GenericCtx<DataModel>) {
  const user = await requireUser(ctx)
  const identity = await ctx.auth.getUserIdentity()
  if (!identity || typeof identity.sessionId !== 'string') {
    throw new ConvexError({ code: 'UNAUTHENTICATED' })
  }
  const session = await getSessionAccess(ctx, identity.sessionId, user._id)
  if (
    !session ||
    session.impersonatedBy ||
    Date.now() - session.createdAt >= RECENT_AUTH_MAX_AGE_SECONDS * 1000
  ) {
    throw new ConvexError({ code: 'REAUTHENTICATION_REQUIRED' })
  }
  return user
}
