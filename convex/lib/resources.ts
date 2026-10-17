import type { PaginationOptions } from 'convex/server'
import { ConvexError } from 'convex/values'

import { MAX_PAGE_SIZE, resourceSchema } from '../../shared/validation'
import type { ResourceInput } from '../../shared/validation'
import type { Doc } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'

export function validateResource(input: ResourceInput): ResourceInput {
  const result = resourceSchema.safeParse(input)
  if (!result.success) {
    throw new ConvexError({
      code: 'INVALID_INPUT',
      message: result.error.issues[0]?.message ?? 'Entrée invalide.',
    })
  }
  return result.data
}

export function validatePagination(options: PaginationOptions): void {
  if (
    !Number.isInteger(options.numItems) ||
    options.numItems < 1 ||
    options.numItems > MAX_PAGE_SIZE
  ) {
    throw new ConvexError({
      code: 'INVALID_INPUT',
      message: `La pagination doit contenir entre 1 et ${MAX_PAGE_SIZE} éléments.`,
    })
  }
}

export function publicResource(resource: Doc<'resources'>) {
  const { _id, _creationTime, title, description, updatedAt, organizationId } =
    resource
  return {
    _id,
    _creationTime,
    title,
    description,
    updatedAt,
    ...(organizationId ? { organizationId } : {}),
  }
}

export async function listOwnedResources(
  ctx: QueryCtx,
  ownerId: string,
  options: PaginationOptions,
  filters: { search?: string; described?: boolean } = {}
) {
  validatePagination(options)
  const search = filters.search?.trim() ?? ''
  if (search.length > 100) throw new ConvexError({ code: 'INVALID_INPUT' })
  const collection = search
    ? ctx.db
        .query('resources')
        .withSearchIndex('search_title', (q) =>
          q
            .search('title', search)
            .eq('ownerId', ownerId)
            .eq('organizationId', undefined)
        )
    : ctx.db
        .query('resources')
        .withIndex('by_owner', (q) =>
          q.eq('ownerId', ownerId).eq('organizationId', undefined)
        )
        .order('desc')
  const filtered = filters.described
    ? collection.filter((q) => q.neq(q.field('description'), ''))
    : collection
  const { page, isDone, continueCursor } = await filtered.paginate({
    ...options,
    maximumRowsRead: 200,
  })
  return { page: page.map(publicResource), isDone, continueCursor }
}

export async function listOrganizationResources(
  ctx: QueryCtx,
  organizationId: string,
  options: PaginationOptions,
  filters: { search?: string; described?: boolean } = {}
) {
  validatePagination(options)
  const search = filters.search?.trim() ?? ''
  if (search.length > 100) throw new ConvexError({ code: 'INVALID_INPUT' })
  const collection = search
    ? ctx.db
        .query('resources')
        .withSearchIndex('search_title', (q) =>
          q.search('title', search).eq('organizationId', organizationId)
        )
    : ctx.db
        .query('resources')
        .withIndex('by_organization', (q) =>
          q.eq('organizationId', organizationId)
        )
        .order('desc')
  const filtered = filters.described
    ? collection.filter((q) => q.neq(q.field('description'), ''))
    : collection
  const { page, isDone, continueCursor } = await filtered.paginate({
    ...options,
    maximumRowsRead: 200,
  })
  return { page: page.map(publicResource), isDone, continueCursor }
}
