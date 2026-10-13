import { v } from 'convex/values'

export const publicUserValidator = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string(),
  createdAt: v.number(),
})

export const publicResourceValidator = v.object({
  _id: v.id('resources'),
  _creationTime: v.number(),
  title: v.string(),
  description: v.string(),
  updatedAt: v.number(),
  organizationId: v.optional(v.string()),
})

export const resourcePageValidator = v.object({
  page: v.array(publicResourceValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
})
