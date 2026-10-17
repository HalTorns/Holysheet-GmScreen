import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter'
import { ConvexError } from 'convex/values'

import { components } from '../_generated/api'
import type { MutationCtx } from '../_generated/server'

const limiter = new RateLimiter(components.rateLimiter, {
  authSessionRead: {
    kind: 'token bucket',
    rate: 120,
    period: MINUTE,
    capacity: 120,
  },
  authTokenRead: {
    kind: 'token bucket',
    rate: 120,
    period: MINUTE,
    capacity: 120,
  },
  authEntry: { kind: 'token bucket', rate: 60, period: MINUTE, capacity: 60 },
  authOther: { kind: 'token bucket', rate: 120, period: MINUTE, capacity: 120 },
  identityEmail: {
    kind: 'token bucket',
    rate: 5,
    period: 5 * MINUTE,
    capacity: 5,
  },
  identityVerification: {
    kind: 'token bucket',
    rate: 5,
    period: 5 * MINUTE,
    capacity: 5,
  },
  mfaVerification: {
    kind: 'token bucket',
    rate: 5,
    period: 5 * MINUTE,
    capacity: 5,
  },
  resourceWrite: {
    kind: 'token bucket',
    rate: 30,
    period: MINUTE,
    capacity: 30,
  },
  accountSensitive: {
    kind: 'token bucket',
    rate: 5,
    period: MINUTE,
    capacity: 5,
  },
  organizationWrite: {
    kind: 'token bucket',
    rate: 20,
    period: MINUTE,
    capacity: 20,
  },
  authEmailRecipient: {
    kind: 'token bucket',
    rate: 3,
    period: 5 * MINUTE,
    capacity: 3,
  },
  authEmailGlobal: { kind: 'fixed window', rate: 100, period: MINUTE },
})

export async function limitUserOperation(
  ctx: MutationCtx,
  operation:
    | 'resourceWrite'
    | 'accountSensitive'
    | 'organizationWrite'
    | 'mfaVerification'
    | 'identityVerification'
    | 'identityEmail',
  userId: string
) {
  const result = await limiter.limit(ctx, operation, { key: userId })
  if (!result.ok)
    throw new ConvexError({
      code: 'RATE_LIMITED',
      retryAfterMs: result.retryAfter,
    })
}

export async function limitAuthEmail(ctx: MutationCtx, email: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(email.toLowerCase())
  )
  const key = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
  for (const [operation, recipientKey] of [
    ['authEmailRecipient', key],
    ['authEmailGlobal', 'all'],
  ] as const) {
    const result = await limiter.limit(ctx, operation, { key: recipientKey })
    if (!result.ok)
      throw new ConvexError({
        code: 'RATE_LIMITED',
        retryAfterMs: result.retryAfter,
      })
  }
}

export async function limitAuthRequest(
  ctx: MutationCtx,
  bucket: 'authSessionRead' | 'authTokenRead' | 'authEntry' | 'authOther',
  key: string
) {
  const result = await limiter.limit(ctx, bucket, { key })
  if (!result.ok)
    throw new ConvexError({
      code: 'RATE_LIMITED',
      retryAfterMs: result.retryAfter,
    })
}

export async function limitIdentityEmail(ctx: MutationCtx, userId: string) {
  await limitUserOperation(ctx, 'identityEmail', userId)
  const result = await limiter.limit(ctx, 'authEmailGlobal', { key: 'all' })
  if (!result.ok)
    throw new ConvexError({
      code: 'RATE_LIMITED',
      retryAfterMs: result.retryAfter,
    })
}

export async function clearUserRateLimits(ctx: MutationCtx, userId: string) {
  // Every configured bucket has one shard, so deletion is bounded to ten rows.
  // Keep recipient/global anti-abuse limits independent of account recreation.
  for (const operation of [
    'resourceWrite',
    'accountSensitive',
    'organizationWrite',
    'mfaVerification',
    'identityVerification',
    'identityEmail',
  ] as const)
    await limiter.reset(ctx, operation, { key: userId })
  for (const operation of [
    'authSessionRead',
    'authTokenRead',
    'authEntry',
    'authOther',
  ] as const)
    await limiter.reset(ctx, operation, { key: `user:${userId}` })
}
