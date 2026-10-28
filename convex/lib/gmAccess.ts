import { ConvexError } from 'convex/values'

import type { Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { normalizeLayout } from './gmFormats'

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
  if (!note || note.ownerId !== ownerId || note.deletedAt !== undefined)
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
  return normalizeLayout(layout)
}

// Fiche du compte, vivante ou en corbeille : chaque fonction décide ensuite
// de l'état qu'elle accepte.
export async function ownedSheet(
  ctx: QueryCtx,
  id: Id<'gmSheets'>,
  ownerId: string
) {
  const sheet = await ctx.db.get('gmSheets', id)
  if (!sheet || sheet.ownerId !== ownerId)
    throw new ConvexError({ code: 'NOT_FOUND' })
  await ownedProject(ctx, sheet.projectId, ownerId)
  return sheet
}

export async function ownedVariable(
  ctx: QueryCtx,
  id: Id<'gmVariables'>,
  ownerId: string
) {
  const variable = await ctx.db.get('gmVariables', id)
  if (!variable || variable.ownerId !== ownerId)
    throw new ConvexError({ code: 'NOT_FOUND' })
  await ownedProject(ctx, variable.projectId, ownerId)
  return variable
}
