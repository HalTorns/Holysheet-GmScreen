import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { requireActionCtx } from '@convex-dev/better-auth/utils'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { betterAuth } from 'better-auth/minimal'
import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { query } from './_generated/server'
import {
  buildAuthOptions,
  SCHEMA_AUTH_SETTINGS,
  type AuthSettings,
} from './authOptions'
import authSchema from './betterAuth/schema'
import { getAuthSettings } from './lib/environment'
import { publicUserValidator } from './lib/validators'

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    local: { schema: authSchema },
  },
)

export function createAuthOptions(
  ctx: GenericCtx<DataModel>,
  settings: AuthSettings = SCHEMA_AUTH_SETTINGS,
) {
  return buildAuthOptions(
    authComponent.adapter(ctx),
    settings,
    async ({ email, otp }) => {
      await requireActionCtx(ctx).runAction(internal.emails.sendOtp, {
        email,
        otp,
      })
    },
  )
}

export function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth({
    ...createAuthOptions(ctx, getAuthSettings()),
    hooks: {
      before: createAuthMiddleware((request) => {
        if (request.path?.startsWith('/organization/')) {
          throw new APIError('FORBIDDEN', {
            message: 'Use the protected Convex organization operations.',
          })
        }
        // Last-key protection lives in an atomic Convex mutation; a separate
        // HTTP pre-check would race concurrent removals.
        if (request.path === '/passkey/delete-passkey') {
          throw new APIError('FORBIDDEN', {
            message: 'Use the protected account.removePasskey operation.',
          })
        }
        return Promise.resolve()
      }),
    },
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
    const session = await ctx.runQuery(
      components.betterAuth.lifecycle.getSession,
      {
        sessionId: identity.sessionId,
        userId: user._id,
      },
    )
    if (!session) return null
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    }
  },
})
