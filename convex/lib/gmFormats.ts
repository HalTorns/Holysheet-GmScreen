import type { Value } from 'convex/values'
import { getDocumentSize, ConvexError } from 'convex/values'

import type { NoteValue } from '../../shared/gm'
import {
  GM_CONTENT_BYTES,
  GM_LAYOUT_BYTES,
  GM_WIDGET_BYTES,
  gmWidget,
} from '../../shared/gm'
import type { Doc } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

export type Widget = Doc<'gmNotes'>
export type Layout = Doc<'gmLayouts'>
// Include system fields and a conservative reserve for IDs allocated on insert.
export function assertBudget(value: Record<string, Value>, limit: number) {
  if (getDocumentSize(value) + 128 > limit)
    throw new ConvexError({ code: 'DOCUMENT_LIMIT' })
}
export function widgetBudget(note: Widget) {
  if (
    !gmWidget.safeParse({
      kind: note.kind,
      config: note.config,
      state: note.state,
    }).success
  )
    throw new ConvexError({ code: 'INVALID_INPUT' })
  assertBudget(note, GM_WIDGET_BYTES)
  return note
}
export function layoutBudget(layout: Layout) {
  if (layout.placements.length > 100)
    throw new ConvexError({ code: 'INVALID_INPUT' })
  assertBudget(layout, GM_LAYOUT_BYTES)
  return layout
}
export async function noteBody(ctx: QueryCtx, note: Doc<'gmNotes'>) {
  return (await noteValue(ctx, note)).body
}
export async function noteValue(
  ctx: QueryCtx,
  note: Doc<'gmNotes'>
): Promise<NoteValue> {
  if (note.kind !== 'note') throw new ConvexError({ code: 'NOT_FOUND' })
  const content = await ctx.db
    .query('gmWidgetContents')
    .withIndex('by_widget', (q) => q.eq('widgetId', note._id))
    .unique()
  if (
    !content ||
    content.ownerId !== note.ownerId ||
    content.projectId !== note.projectId ||
    content.screenId !== note.screenId
  )
    throw new ConvexError({ code: 'CONTENT_INTEGRITY' })
  return { body: content.body, bodyFormat: content.bodyFormat ?? 'plain' }
}
export async function writeContent(
  ctx: MutationCtx,
  note: Widget,
  body: string,
  bodyFormat: NoteValue['bodyFormat'] = 'plain'
) {
  const value = {
    ownerId: note.ownerId,
    projectId: note.projectId,
    screenId: note.screenId,
    widgetId: note._id,
    body,
    bodyFormat,
    updatedAt: note.updatedAt,
    formatVersion: 2 as const,
  }
  assertBudget(value, GM_CONTENT_BYTES)
  const content = await ctx.db
    .query('gmWidgetContents')
    .withIndex('by_widget', (q) => q.eq('widgetId', note._id))
    .unique()
  if (
    content &&
    (content.ownerId !== note.ownerId ||
      content.projectId !== note.projectId ||
      content.screenId !== note.screenId)
  )
    throw new ConvexError({ code: 'CONTENT_INTEGRITY' })
  if (content) await ctx.db.replace('gmWidgetContents', content._id, value)
  else await ctx.db.insert('gmWidgetContents', value)
}
