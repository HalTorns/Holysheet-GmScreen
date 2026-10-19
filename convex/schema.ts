import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  cleanupJobs: defineTable(
    v.union(
      v.object({
        kind: v.literal('account'),
        userId: v.string(),
        email: v.string(),
        retryAt: v.number(),
      }),
      v.object({
        kind: v.literal('organization'),
        organizationId: v.string(),
        retryAt: v.number(),
      })
    )
  ).index('by_retry_at', ['retryAt']),
  resources: defineTable({
    ownerId: v.string(),
    organizationId: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    updatedAt: v.number(),
  })
    .index('by_owner', ['ownerId', 'organizationId'])
    .index('by_organization', ['organizationId'])
    .searchIndex('search_title', {
      searchField: 'title',
      filterFields: ['ownerId', 'organizationId'],
    }),
  securityEvents: defineTable({
    event: v.union(
      v.literal('resource.created'),
      v.literal('resource.updated'),
      v.literal('resource.deleted'),
      v.literal('account.deleted'),
      v.literal('passkey.deleted'),
      v.literal('organization.created'),
      v.literal('organization.updated'),
      v.literal('organization.invited'),
      v.literal('organization.role_changed'),
      v.literal('organization.member_removed'),
      v.literal('organization.deleted')
    ),
    actorId: v.optional(v.string()),
    resourceId: v.optional(v.id('resources')),
    organizationId: v.optional(v.string()),
  })
    .index('by_actor', ['actorId'])
    .index('by_organization', ['organizationId']),
})
