import { v } from 'convex/values'

export const userRole = v.union(v.literal('user'), v.literal('admin'))
export const managedUser = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string(),
  emailVerified: v.boolean(),
  role: userRole,
  banned: v.boolean(),
  banReason: v.union(v.string(), v.null()),
  banExpires: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  adminVersion: v.number(),
})
export const managedUsersPage = v.object({
  page: v.array(managedUser),
  isDone: v.boolean(),
  continueCursor: v.string(),
})
export const moderationChange = v.union(
  v.object({ kind: v.literal('role'), role: userRole }),
  v.object({
    kind: v.literal('ban'),
    reason: v.string(),
    days: v.union(v.literal(1), v.literal(7), v.literal(30), v.null()),
  }),
  v.object({ kind: v.literal('unban') }),
  v.object({ kind: v.literal('revoke') })
)
export const managedSessions = v.object({
  page: v.array(
    v.object({
      id: v.string(),
      userAgent: v.union(v.string(), v.null()),
      createdAt: v.number(),
      expiresAt: v.number(),
    })
  ),
  hasMore: v.boolean(),
})
export const ownAccountStatus = v.object({
  role: userRole,
  banned: v.boolean(),
  banReason: v.union(v.string(), v.null()),
  banExpires: v.union(v.number(), v.null()),
  sessionsRevokedAt: v.union(v.number(), v.null()),
})
