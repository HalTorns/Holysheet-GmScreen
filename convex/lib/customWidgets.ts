import { ConvexError } from 'convex/values'

import type { Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { ownedProject } from './gmAccess'

export async function ownedDefinition(
  ctx: QueryCtx,
  id: Id<'gmCustomWidgets'>,
  ownerId: string
) {
  const definition = await ctx.db.get('gmCustomWidgets', id)
  if (!definition || definition.ownerId !== ownerId)
    throw new ConvexError({ code: 'NOT_FOUND' })
  await ownedProject(ctx, definition.projectId, ownerId)
  return definition
}
export async function validateCustomReference(
  ctx: QueryCtx,
  id: Id<'gmCustomWidgets'> | undefined,
  projectId: Id<'gmProjects'>,
  ownerId: string
) {
  if (!id) return
  const definition = await ownedDefinition(ctx, id, ownerId)
  if (definition.projectId !== projectId || definition.deletedAt !== undefined)
    throw new ConvexError({ code: 'NOT_FOUND' })
}
