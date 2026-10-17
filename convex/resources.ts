import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { requireUser } from './lib/auth'
import { organizationsEnabled } from './lib/modules'
import { requireOrganizationPermission } from './lib/organizations'
import { limitUserOperation } from './lib/rateLimits'
import {
  listOwnedResources,
  listOrganizationResources,
  publicResource,
  validateResource,
} from './lib/resources'
import {
  publicResourceValidator,
  resourcePageValidator,
} from './lib/validators'

const resourceArgs = { title: v.string(), description: v.string() }

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    organizationId: v.optional(v.string()),
    search: v.optional(v.string()),
    described: v.optional(v.boolean()),
  },
  returns: resourcePageValidator,
  handler: async (ctx, { paginationOpts, organizationId, ...filters }) => {
    const user = await requireUser(ctx)
    if (organizationId !== undefined) {
      await requireOrganizationPermission(ctx, organizationId, user._id, 'read')
      return await listOrganizationResources(
        ctx,
        organizationId,
        paginationOpts,
        filters
      )
    }
    return await listOwnedResources(ctx, user._id, paginationOpts, filters)
  },
})

export const get = query({
  args: { id: v.id('resources') },
  returns: v.union(publicResourceValidator, v.null()),
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx)
    const resource = await ctx.db.get('resources', id)
    if (resource?.organizationId !== undefined) {
      if (!organizationsEnabled()) return null
      try {
        await requireOrganizationPermission(
          ctx,
          resource.organizationId,
          user._id,
          'read'
        )
      } catch {
        // Fail closed without exposing whether another tenant owns this ID.
        return null
      }
      return publicResource(resource)
    }
    return resource?.ownerId === user._id ? publicResource(resource) : null
  },
})

export const create = mutation({
  args: { ...resourceArgs, organizationId: v.optional(v.string()) },
  returns: v.id('resources'),
  handler: async (ctx, { organizationId, ...input }) => {
    const user = await requireUser(ctx)
    if (organizationId !== undefined)
      await requireOrganizationPermission(
        ctx,
        organizationId,
        user._id,
        'write'
      )
    const resource = validateResource(input)
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    const id = await ctx.db.insert('resources', {
      ...resource,
      ownerId: user._id,
      ...(organizationId === undefined ? {} : { organizationId }),
      updatedAt: Date.now(),
    })
    await ctx.db.insert('securityEvents', {
      event: 'resource.created',
      actorId: user._id,
      resourceId: id,
      ...(organizationId === undefined ? {} : { organizationId }),
    })
    return id
  },
})

export const update = mutation({
  args: {
    id: v.id('resources'),
    expectedUpdatedAt: v.number(),
    ...resourceArgs,
  },
  returns: v.null(),
  handler: async (ctx, { id, expectedUpdatedAt, ...input }) => {
    const user = await requireUser(ctx)
    const resource = await ctx.db.get('resources', id)
    if (!resource) throw new ConvexError({ code: 'NOT_FOUND' })
    if (resource.organizationId !== undefined)
      await requireOrganizationPermission(
        ctx,
        resource.organizationId,
        user._id,
        'write'
      )
    else if (resource.ownerId !== user._id)
      throw new ConvexError({ code: 'NOT_FOUND' })
    if (resource.updatedAt !== expectedUpdatedAt)
      throw new ConvexError({ code: 'CONFLICT' })
    const fields = validateResource(input)
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    await ctx.db.patch('resources', id, {
      ...fields,
      updatedAt: Math.max(Date.now(), resource.updatedAt + 1),
    })
    await ctx.db.insert('securityEvents', {
      event: 'resource.updated',
      actorId: user._id,
      resourceId: id,
      ...(resource.organizationId === undefined
        ? {}
        : { organizationId: resource.organizationId }),
    })
    return null
  },
})

export const remove = mutation({
  args: { id: v.id('resources') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx)
    const resource = await ctx.db.get('resources', id)
    if (!resource) throw new ConvexError({ code: 'NOT_FOUND' })
    if (resource.organizationId !== undefined)
      await requireOrganizationPermission(
        ctx,
        resource.organizationId,
        user._id,
        'write'
      )
    else if (resource.ownerId !== user._id)
      throw new ConvexError({ code: 'NOT_FOUND' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    await ctx.db.delete('resources', id)
    await ctx.db.insert('securityEvents', {
      event: 'resource.deleted',
      actorId: user._id,
      resourceId: id,
      ...(resource.organizationId === undefined
        ? {}
        : { organizationId: resource.organizationId }),
    })
    return null
  },
})
