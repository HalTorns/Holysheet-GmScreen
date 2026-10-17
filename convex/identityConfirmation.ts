import { ConvexError, v } from 'convex/values'

import { identityOperationSchema } from '../shared/identity-confirmation'
import { otpSchema } from '../shared/validation'
import { components, internal } from './_generated/api'
import { action } from './_generated/server'
import { requireUser } from './lib/auth'
import { getAuthSettings } from './lib/environment'

async function codeDigest(sessionId: string, operation: string, code: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getAuthSettings().secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(JSON.stringify([sessionId, operation, code]))
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}
export const request = action({
  args: { operation: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const identity = await ctx.auth.getUserIdentity()
    if (!identity || typeof identity.sessionId !== 'string')
      throw new ConvexError({ code: 'UNAUTHENTICATED' })
    const parsed = identityOperationSchema.safeParse(args.operation)
    if (!parsed.success) throw new ConvexError({ code: 'INVALID_INPUT' })
    // Rejection sampling avoids modulo bias. Codes never enter logs or responses.
    let random: number
    do {
      random = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
    } while (random >= 4_294_000_000)
    const code = String(random % 1_000_000).padStart(6, '0')
    await ctx.runAction(internal.emails.sendConfirmation, {
      userId: user._id,
      email: user.email,
      otp: code,
    })
    await ctx.runMutation(components.betterAuth.identityConfirmation.issue, {
      userId: user._id,
      sessionId: identity.sessionId,
      operation: parsed.data,
      digest: await codeDigest(identity.sessionId, parsed.data, code),
    })
    return null
  },
})
export const verify = action({
  args: { operation: v.string(), code: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const identity = await ctx.auth.getUserIdentity()
    if (!identity || typeof identity.sessionId !== 'string')
      throw new ConvexError({ code: 'UNAUTHENTICATED' })
    const operation = identityOperationSchema.safeParse(args.operation)
    const code = otpSchema.safeParse(args.code)
    if (!operation.success || !code.success)
      throw new ConvexError({ code: 'INVALID_INPUT' })
    await ctx.runMutation(internal.authSecurity.consumeIdentityAttempt, {
      userId: user._id,
    })
    return ctx.runMutation(components.betterAuth.identityConfirmation.verify, {
      userId: user._id,
      sessionId: identity.sessionId,
      operation: operation.data,
      digest: await codeDigest(identity.sessionId, operation.data, code.data),
    })
  },
})
