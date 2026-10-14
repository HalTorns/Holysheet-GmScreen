import { createClient } from '@convex-dev/better-auth'
import type { GenericCtx } from '@convex-dev/better-auth'
import { requireActionCtx } from '@convex-dev/better-auth/utils'
import { betterAuth } from 'better-auth/minimal'
import { v } from 'convex/values'

import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { query } from './_generated/server'
import { buildAuthOptions, SCHEMA_AUTH_SETTINGS } from './authOptions'
import type { AuthSettings } from './authOptions'
import authSchema from './betterAuth/schema'
import { authHooks } from './lib/authHooks'
import { getAuthModules } from './lib/authModules'
import { getEmailSettings } from './lib/emailEnvironment'
import { getAuthSettings } from './lib/environment'
import { getSessionAccess } from './lib/sessionAccess'
import { publicUserValidator } from './lib/validators'

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    local: { schema: authSchema },
  }
)

export function createAuthOptions(
  ctx: GenericCtx<DataModel>,
  settings: AuthSettings = SCHEMA_AUTH_SETTINGS
) {
  const modules = settings === SCHEMA_AUTH_SETTINGS ? null : getAuthModules()
  if (modules) getEmailSettings()
  return buildAuthOptions(
    authComponent.adapter(ctx),
    settings,
    async ({ email, otp }) => {
      await requireActionCtx(ctx).runAction(internal.emails.sendOtp, {
        email,
        otp,
      })
    },
    async ({ email, url }) => {
      await requireActionCtx(ctx).runAction(internal.emails.sendMagicLink, {
        email,
        url,
      })
    },
    {
      adminIds: modules?.AUTH_ADMIN_ENABLED ? modules.ADMIN_USER_IDS : [],
      ...(modules?.AUTH_GOOGLE_ENABLED &&
      modules.GOOGLE_CLIENT_ID &&
      modules.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: modules.GOOGLE_CLIENT_ID,
              clientSecret: modules.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
      ...(modules?.AUTH_GITHUB_ENABLED &&
      modules.GITHUB_CLIENT_ID &&
      modules.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: modules.GITHUB_CLIENT_ID,
              clientSecret: modules.GITHUB_CLIENT_SECRET,
            },
          }
        : {}),
    }
  )
}

export function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth({
    ...createAuthOptions(ctx, getAuthSettings()),
    hooks: authHooks(ctx),
  })
}

export const getCurrentUser = query({
  args: {},
  returns: v.union(publicUserValidator, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity || typeof identity.sessionId !== 'string') return null
    const user = await authComponent.safeGetAuthUser(ctx)
    if (!user?.emailVerified) return null
    const session = await getSessionAccess(ctx, identity.sessionId, user._id)
    if (!session?.mfaVerified) return null
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    }
  },
})

export const getAccessState = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      requiresMfa: v.boolean(),
      mfaEnabled: v.boolean(),
      isImpersonating: v.boolean(),
      isAdmin: v.boolean(),
    })
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity || typeof identity.sessionId !== 'string') return null
    const user = await authComponent.safeGetAuthUser(ctx)
    if (!user?.emailVerified) return null
    const access = await getSessionAccess(ctx, identity.sessionId, user._id)
    if (!access) return null
    const modules = getAuthModules()
    return {
      requiresMfa: !access.mfaVerified,
      mfaEnabled: user.twoFactorEnabled === true,
      isImpersonating: Boolean(access.impersonatedBy),
      isAdmin:
        user.twoFactorEnabled === true &&
        access.mfaVerified &&
        !access.impersonatedBy &&
        modules.AUTH_ADMIN_ENABLED &&
        modules.ADMIN_USER_IDS.includes(user._id),
    }
  },
})
