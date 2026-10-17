import type { GenericCtx } from '@convex-dev/better-auth'
import { ConvexError } from 'convex/values'

import type { DataModel } from '../_generated/dataModel'
import { requireUser } from './auth'
import { getSessionAccess } from './sessionAccess'

export async function requireSiteAdmin(ctx: GenericCtx<DataModel>) {
  const user = await requireUser(ctx)
  const identity = await ctx.auth.getUserIdentity()
  if (!identity || typeof identity.sessionId !== 'string')
    throw new ConvexError({ code: 'UNAUTHENTICATED' })
  const session = await getSessionAccess(ctx, identity.sessionId, user._id)
  if (user.role !== 'admin' || !session || session.impersonatedBy)
    throw new ConvexError({ code: 'FORBIDDEN' })
  return { user, sessionId: identity.sessionId }
}
