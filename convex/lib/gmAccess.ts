import { ConvexError } from 'convex/values'

import type { Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'

export async function ownedProject(
  ctx: QueryCtx,
  id: Id<'gmProjects'>,
  ownerId: string
) {
  const project = await ctx.db.get('gmProjects', id)
  if (!project || project.ownerId !== ownerId)
    throw new ConvexError({ code: 'NOT_FOUND' })
  return project
}

export async function ownedScreen(
  ctx: QueryCtx,
  id: Id<'gmScreens'>,
  ownerId: string
) {
  const screen = await ctx.db.get('gmScreens', id)
  if (!screen || screen.ownerId !== ownerId)
    throw new ConvexError({ code: 'NOT_FOUND' })
  await ownedProject(ctx, screen.projectId, ownerId)
  return screen
}

export async function ownedNote(
  ctx: QueryCtx,
  id: Id<'gmNotes'>,
  ownerId: string
) {
  const note = await ctx.db.get('gmNotes', id)
  if (!note || note.ownerId !== ownerId)
    throw new ConvexError({ code: 'NOT_FOUND' })
  await ownedScreen(ctx, note.screenId, ownerId)
  return note
}

export async function ownedLayout(
  ctx: QueryCtx,
  id: Id<'gmLayouts'>,
  ownerId: string
) {
  const layout = await ctx.db.get('gmLayouts', id)
  if (!layout || layout.ownerId !== ownerId)
    throw new ConvexError({ code: 'NOT_FOUND' })
  await ownedScreen(ctx, layout.screenId, ownerId)
  return layout
}
