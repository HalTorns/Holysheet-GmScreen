import { ConvexError } from 'convex/values'

import {
  GM_HISTORY_LIMIT,
  GM_CONTENT_BYTES,
  GM_LAYOUT_BYTES,
  GM_MAX_NOTES,
  GM_MAX_LAYOUTS,
  GM_MAX_DIMENSION,
  GM_MIN_WIDGET_WIDTH,
  GM_MIN_WIDGET_HEIGHT,
  gmLayoutSize,
  gmNote,
  gmWidgetStyle,
} from '../../shared/gm'
import type { Doc } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { ownedScreen } from './gmAccess'
import {
  normalizeLayout,
  normalizePlacement,
  normalizeSnapshot,
  convertNote,
  noteBody,
  writeContent,
  requireMigratedScreen,
  assertBudget,
  layoutBudget,
} from './gmFormats'
import type { Layout } from './gmFormats'
import { limitUserOperation } from './rateLimits'

type LayoutState = Pick<Layout, 'name' | 'width' | 'height' | 'placements'>

export function layoutState(
  layout: Pick<Doc<'gmLayouts'>, 'name' | 'width' | 'height' | 'placements'>
): LayoutState {
  return {
    name: layout.name,
    width: layout.width,
    height: layout.height,
    placements: layout.placements.map(normalizePlacement),
  }
}

export function assertVersion(actual: number, expected: number) {
  if (!Number.isSafeInteger(expected) || expected < 0)
    throw new ConvexError({ code: 'INVALID_INPUT' })
  if (actual !== expected) throw new ConvexError({ code: 'CONFLICT' })
}

export async function recordHistory(
  ctx: MutationCtx,
  document: Doc<'gmNotes'> | Doc<'gmLayouts'>,
  snapshot: Doc<'gmEditorHistory'>['snapshot']
) {
  const normalizedSnapshot = normalizeSnapshot(snapshot)
  assertBudget(
    {
      ownerId: document.ownerId,
      projectId: document.projectId,
      screenId: document.screenId,
      subjectId: document._id,
      version: document.version,
      updatedAt: Date.now(),
      formatVersion: 2,
      snapshot: normalizedSnapshot,
    },
    snapshot.kind === 'note' ? GM_CONTENT_BYTES : GM_LAYOUT_BYTES
  )
  await ctx.db.insert('gmEditorHistory', {
    formatVersion: 2,
    ownerId: document.ownerId,
    projectId: document.projectId,
    screenId: document.screenId,
    subjectId: document._id,
    version: document.version,
    snapshot: normalizedSnapshot,
    updatedAt: Date.now(),
  })
  const revisions = await ctx.db
    .query('gmEditorHistory')
    .withIndex('by_subject', (q) => q.eq('subjectId', document._id))
    .order('desc')
    .take(GM_HISTORY_LIMIT + 1)
  for (const revision of revisions.slice(GM_HISTORY_LIMIT))
    await ctx.db.delete('gmEditorHistory', revision._id)
}

export async function saveNote(
  ctx: MutationCtx,
  note: Doc<'gmNotes'>,
  expectedVersion: number,
  body: string
) {
  assertVersion(note.version, expectedVersion)
  if (!gmNote.safeParse(body).success)
    throw new ConvexError({ code: 'INVALID_INPUT' })
  const previousBody = await noteBody(ctx, note)
  const normalized = await convertNote(ctx, note)
  if (body === previousBody) return note.version
  await limitUserOperation(ctx, 'gmEditorWrite', note.ownerId)
  await recordHistory(ctx, note, { kind: 'note', body: previousBody })
  await writeContent(ctx, { ...normalized, updatedAt: Date.now() }, body)
  await ctx.db.patch('gmNotes', note._id, {
    version: note.version + 1,
    updatedAt: Date.now(),
  })
  return note.version + 1
}

export async function saveLayout(
  ctx: MutationCtx,
  layout: Doc<'gmLayouts'>,
  expectedVersion: number,
  input: Omit<LayoutState, 'placements'> & {
    placements: Doc<'gmLayouts'>['placements'][number][]
  }
) {
  await requireMigratedScreen(ctx, layout.screenId)
  const forms = new Set(
    input.placements.map((p) => ('widgetId' in p ? 'v2' : 'v1'))
  )
  if (forms.size > 1) throw new ConvexError({ code: 'INVALID_INPUT' })
  const value = {
    ...input,
    placements: input.placements.map(normalizePlacement),
  }
  assertVersion(layout.version, expectedVersion)
  const screen = await ownedScreen(ctx, layout.screenId, layout.ownerId)
  if (screen.layoutLocked) throw new ConvexError({ code: 'LAYOUT_LOCKED' })
  if (
    layout.kind !== 'digital' ||
    layout.unit !== 'px' ||
    !gmLayoutSize.safeParse(value).success ||
    value.placements.length > GM_MAX_NOTES
  )
    throw new ConvexError({ code: 'INVALID_INPUT' })
  const notes = await ctx.db
    .query('gmNotes')
    .withIndex('by_screen_live', (q) =>
      q.eq('screenId', layout.screenId).eq('deletedAt', undefined)
    )
    .take(GM_MAX_NOTES + 1)
  const ids = new Set(value.placements.map((p) => p.widgetId))
  if (
    ids.size !== value.placements.length ||
    ids.size !== notes.length ||
    notes.some(
      (n) =>
        !ids.has(n._id) ||
        n.ownerId !== layout.ownerId ||
        n.projectId !== layout.projectId
    )
  )
    throw new ConvexError({ code: 'INVALID_INPUT' })
  for (const p of value.placements) {
    if (
      (p.style !== undefined && !gmWidgetStyle.safeParse(p.style).success) ||
      (p.groupId !== undefined && !/^[a-zA-Z0-9_-]{1,80}$/.test(p.groupId)) ||
      ![p.x, p.y, p.width, p.height, p.layer].every(Number.isSafeInteger) ||
      p.x < 0 ||
      p.y < 0 ||
      p.x > 2 * GM_MAX_DIMENSION ||
      p.y > 2 * GM_MAX_DIMENSION ||
      p.width < GM_MIN_WIDGET_WIDTH ||
      p.height < GM_MIN_WIDGET_HEIGHT ||
      p.width > GM_MAX_DIMENSION ||
      p.height > GM_MAX_DIMENSION ||
      p.layer < 0 ||
      p.layer >= GM_MAX_NOTES
    )
      throw new ConvexError({ code: 'INVALID_INPUT' })
  }
  const state = { ...value, name: value.name.trim() }
  if (state.name !== layout.name) {
    const profiles = await ctx.db
      .query('gmLayouts')
      .withIndex('by_screen', (q) => q.eq('screenId', layout.screenId))
      .take(GM_MAX_LAYOUTS)
    if (
      profiles.some(
        (p) =>
          p._id !== layout._id &&
          p.kind === 'digital' &&
          p.name.toLocaleLowerCase('fr') === state.name.toLocaleLowerCase('fr')
      )
    )
      throw new ConvexError({ code: 'LAYOUT_NAME_TAKEN' })
  }
  if (
    JSON.stringify(layoutState(layout)) === JSON.stringify(layoutState(state))
  )
    return layout.version
  await limitUserOperation(ctx, 'gmEditorWrite', layout.ownerId)
  await recordHistory(ctx, layout, { kind: 'layout', ...layoutState(layout) })
  layoutBudget(normalizeLayout({ ...layout, ...state }))
  await ctx.db.patch('gmLayouts', layout._id, {
    formatVersion: 2,
    ...state,
    version: layout.version + 1,
    updatedAt: Date.now(),
  })
  return layout.version + 1
}
