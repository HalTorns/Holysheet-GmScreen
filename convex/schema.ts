import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import {
  projectFields,
  folderFields,
  screenFields,
  noteFields,
  layoutFields,
  historyFields,
} from './lib/gmValidators'

export default defineSchema({
  gmEditorHistory: defineTable(historyFields)
    .index('by_owner', ['ownerId'])
    .index('by_subject', ['subjectId', 'version']),
  gmProjects: defineTable(projectFields).index('by_owner', ['ownerId']),
  gmFolders: defineTable(folderFields)
    .index('by_owner', ['ownerId'])
    .index('by_parent', ['projectId', 'parentId']),
  gmScreens: defineTable(screenFields)
    .index('by_owner', ['ownerId'])
    .index('by_folder', ['projectId', 'folderId']),
  gmNotes: defineTable(noteFields)
    .index('by_owner', ['ownerId'])
    .index('by_screen_live', ['screenId', 'deletedAt'])
    .index('by_screen', ['screenId']),
  gmLayouts: defineTable(layoutFields)
    .index('by_owner', ['ownerId'])
    .index('by_screen', ['screenId']),
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
