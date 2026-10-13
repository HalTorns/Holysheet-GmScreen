import { components } from '../_generated/api'
import type { QueryCtx } from '../_generated/server'
import { requireOrganizationsEnabled } from './modules'

export async function requireOrganizationPermission(
  ctx: QueryCtx,
  organizationId: string,
  userId: string,
  permission: 'read' | 'write' | 'manage' | 'own',
) {
  requireOrganizationsEnabled()
  return await ctx.runQuery(components.betterAuth.organizations.authorize, {
    organizationId,
    actorId: userId,
    permission,
  })
}
