import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter'
import { ConvexError } from 'convex/values'

import { components } from '../_generated/api'
import type { MutationCtx } from '../_generated/server'

const limiter = new RateLimiter(components.rateLimiter, {
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
    | 'mfaVerification',
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
