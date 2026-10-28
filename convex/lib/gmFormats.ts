import type { Value } from 'convex/values'
import { getDocumentSize, ConvexError } from 'convex/values'

import {
  GM_CONTENT_BYTES,
  GM_LAYOUT_BYTES,
  GM_WIDGET_BYTES,
  gmWidget,
} from '../../shared/gm'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type Placement = Doc<'gmLayouts'>['placements'][number]
export function normalizePlacement(placement: Placement) {
  if ('widgetId' in placement) return placement
  const { noteId, ...geometry } = placement
  return { ...geometry, widgetId: noteId }
}
export function normalizeLayout(
  layout: Omit<Doc<'gmLayouts'>, 'placements'> & { placements: Placement[] }
) {
  return {
    ...layout,
    formatVersion: 2 as const,
    placements: layout.placements.map(normalizePlacement),
  }
}
export type Widget = ReturnType<typeof normalizeWidget>
export type Layout = ReturnType<typeof normalizeLayout>
export function normalizeWidget(note: Doc<'gmNotes'>) {
  if (note.formatVersion === 2) return note
  const { body: _body, formatVersion: _formatVersion, ...metadata } = note
  return {
    ...metadata,
    formatVersion: 2 as const,
    kind: 'note' as const,
    config: {},
    state: {},
  }
}
export function normalizeSnapshot(
  snapshot: Doc<'gmEditorHistory'>['snapshot']
) {
  if (snapshot.kind === 'note') return { ...snapshot, config: {}, state: {} }
  return {
    ...snapshot,
    placements: snapshot.placements.map(normalizePlacement),
  }
}
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
  if (note.formatVersion !== 2) return note.body
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
  return content.body
}
export async function writeContent(
  ctx: MutationCtx,
  note: Widget,
  body: string
) {
  const value = {
    ownerId: note.ownerId,
    projectId: note.projectId,
    screenId: note.screenId,
    widgetId: note._id,
    body,
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
export async function convertNote(ctx: MutationCtx, note: Doc<'gmNotes'>) {
  if (note.formatVersion === 2) return note
  const normalized = widgetBudget(normalizeWidget(note))
  await writeContent(ctx, normalized, note.body)
  const { _id, _creationTime: _time, ...value } = normalized
  await ctx.db.replace('gmNotes', _id, value)
  return normalized
}
export async function requireMigratedScreen(
  ctx: QueryCtx,
  screenId: Id<'gmScreens'>
) {
  const legacy = await ctx.db
    .query('gmNotes')
    .withIndex('by_screen_format', (q) =>
      q.eq('screenId', screenId).eq('formatVersion', undefined)
    )
    .first()
  const explicitLegacy =
    legacy ??
    (await ctx.db
      .query('gmNotes')
      .withIndex('by_screen_format', (q) =>
        q.eq('screenId', screenId).eq('formatVersion', 1)
      )
      .first())
  if (explicitLegacy) throw new ConvexError({ code: 'MIGRATION_REQUIRED' })
}
