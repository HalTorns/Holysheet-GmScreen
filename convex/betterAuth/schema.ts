import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { tables } from './generatedSchema'

// Keep custom indexes separate from the Better Auth CLI's generated tables.
export default defineSchema({
  ...tables,
  sessionAssurances: defineTable({
    sessionId: v.id('session'),
    userId: v.string(),
    factorId: v.id('twoFactor'),
    verifiedAt: v.number(),
    expiresAt: v.number(),
  })
    .index('by_session', ['sessionId'])
    .index('by_user', ['userId'])
    .index('by_expiry', ['expiresAt']),
  impersonations: defineTable({
    sessionId: v.id('session'),
    actorSessionId: v.id('session'),
    actorId: v.string(),
    targetId: v.string(),
    expiresAt: v.number(),
  })
    .index('by_session', ['sessionId'])
    .index('by_actor', ['actorId'])
    .index('by_target', ['targetId'])
    .index('by_expiry', ['expiresAt']),
  authAudit: defineTable({
    event: v.union(v.literal('mfa.verified'), v.literal('admin.impersonated')),
    actorId: v.string(),
    targetId: v.optional(v.string()),
    expiresAt: v.number(),
  })
    .index('by_actor', ['actorId'])
    .index('by_target', ['targetId'])
    .index('by_expiry', ['expiresAt']),
  passkey: tables.passkey.index('credentialID', ['credentialID']),
  rateLimit: tables.rateLimit.index('lastRequest', ['lastRequest']),
  member: tables.member
    .index('organizationId_userId', ['organizationId', 'userId'])
    .index('organizationId_role', ['organizationId', 'role']),
  invitation: tables.invitation
    .index('organizationId_email', ['organizationId', 'email'])
    .index('organizationId_inviterId', ['organizationId', 'inviterId'])
    .index('email_status', ['email', 'status'])
    .index('expiresAt', ['expiresAt']),
})
