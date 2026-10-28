import { ConvexError } from 'convex/values'

import { GM_MAX_NOTES, GM_MAX_LAYOUTS } from '../../shared/gm'
import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { ownedScreen } from './gmAccess'
import {
  normalizeLayout,
  normalizeWidget,
  writeContent,
  requireMigratedScreen,
  layoutBudget,
  widgetBudget,
} from './gmFormats'
import { limitUserOperation } from './rateLimits'

export async function createNote(
  ctx: MutationCtx,
  screenId: Id<'gmScreens'>,
  ownerId: string
) {
  const screen = await ownedScreen(ctx, screenId, ownerId)
  await requireMigratedScreen(ctx, screenId)
  if (screen.layoutLocked) throw new ConvexError({ code: 'LAYOUT_LOCKED' })
  const notes = await ctx.db
    .query('gmNotes')
    .withIndex('by_screen_live', (q) =>
      q.eq('screenId', screenId).eq('deletedAt', undefined)
    )
    .take(GM_MAX_NOTES + 1)
  if (notes.length >= GM_MAX_NOTES)
    throw new ConvexError({ code: 'SCREEN_LIMIT' })
  await limitUserOperation(ctx, 'resourceWrite', ownerId)
  const id = await ctx.db.insert('gmNotes', {
    ownerId,
    projectId: screen.projectId,
    screenId,
    formatVersion: 2,
    kind: 'note',
    config: {},
    state: {},
    version: 0,
    updatedAt: Date.now(),
  })
  const layouts = await ctx.db
    .query('gmLayouts')
    .withIndex('by_screen', (q) => q.eq('screenId', screenId))
    .take(GM_MAX_LAYOUTS)
  const note = await ctx.db.get('gmNotes', id)
  if (!note) throw new ConvexError({ code: 'NOT_FOUND' })
  await writeContent(ctx, widgetBudget(normalizeWidget(note)), '')
  for (const rawLayout of layouts) {
    const layout = normalizeLayout(rawLayout)
    const factor = layout.unit === 'mm' ? 0.2 : 1
    const width = Math.min(400 * factor, layout.width - 24 * factor)
    const height = Math.min(240 * factor, layout.height - 24 * factor)
    const placements = [
      ...layout.placements,
      {
        widgetId: id,
        x: Math.min(24 * factor, layout.width - width),
        y: Math.min(
          (24 + (notes.length % 4) * 200) * factor,
          layout.height - height
        ),
        width,
        height,
        layer: notes.length,
      },
    ]
    layoutBudget({ ...layout, placements })
    await ctx.db.patch('gmLayouts', layout._id, {
      formatVersion: 2,
      placements,
      version: layout.version + 1,
      updatedAt: Date.now(),
    })
  }
  return id
}
