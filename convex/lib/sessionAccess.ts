import type { GenericCtx } from '@convex-dev/better-auth'

import { components } from '../_generated/api'
import type { DataModel } from '../_generated/dataModel'
import { getAuthModules } from './authModules'

export async function getSessionAccess(
  ctx: GenericCtx<DataModel>,
  sessionId: string,
  userId: string
) {
  const session = await ctx.runQuery(components.betterAuth.access.getSession, {
    sessionId,
    userId,
  })
  if (session?.impersonatedBy) {
    const modules = getAuthModules()
    if (
      !modules.AUTH_ADMIN_ENABLED ||
      !modules.ADMIN_USER_IDS.includes(session.impersonatedBy)
    )
      return null
  }
  return session
}
