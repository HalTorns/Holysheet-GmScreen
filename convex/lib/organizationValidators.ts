import { v } from 'convex/values'

export const organizationRoleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer')
)
export const invitationRoleValidator = v.union(
  v.literal('admin'),
  v.literal('member'),
  v.literal('viewer')
)
export const organizationSummaryValidator = v.object({
  id: v.string(),
  name: v.string(),
  role: organizationRoleValidator,
})
export const memberValidator = v.object({
  userId: v.string(),
  name: v.string(),
  email: v.string(),
  role: organizationRoleValidator,
})
export const invitationValidator = v.object({
  id: v.string(),
  organizationId: v.string(),
  organizationName: v.string(),
  email: v.string(),
  role: invitationRoleValidator,
  expiresAt: v.number(),
})
