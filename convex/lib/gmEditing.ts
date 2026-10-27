import { ConvexError } from 'convex/values'

import {
  GM_HISTORY_LIMIT,
  GM_MAX_NOTES,
  GM_MAX_LAYOUTS,
  GM_MAX_DIMENSION,
  GM_MIN_WIDGET_WIDTH,
  GM_MIN_WIDGET_HEIGHT,
  gmLayoutSize,
  gmNote,
} from '../../shared/gm'
import type { Doc } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { ownedScreen } from './gmAccess'
import { limitUserOperation } from './rateLimits'

type LayoutState = Pick<
  Doc<'gmLayouts'>,
  'name' | 'width' | 'height' | 'placements'
>

export function layoutState(layout: LayoutState): LayoutState {
  return {
    name: layout.name,
    width: layout.width,
    height: layout.height,
    placements: layout.placements,
  }
}

export function assertVersion(actual: number, expected: number) {
  if (!Number.isSafeInteger(expected) || expected < 0)
    throw new ConvexError({ code: 'INVALID_INPUT' })
  if (actual !== expected) throw new ConvexError({ code: 'CONFLICT' })
}

async function recordHistory(
  ctx: MutationCtx,
  document: Doc<'gmNotes'> | Doc<'gmLayouts'>,
  snapshot: Doc<'gmEditorHistory'>['snapshot']
) {
  await ctx.db.insert('gmEditorHistory', {
    ownerId: document.ownerId,
    projectId: document.projectId,
    screenId: document.screenId,
    subjectId: document._id,
    version: document.version,
    snapshot,
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
  if (body === note.body) return note.version
  await limitUserOperation(ctx, 'gmEditorWrite', note.ownerId)
  await recordHistory(ctx, note, { kind: 'note', body: note.body })
  await ctx.db.patch('gmNotes', note._id, {
    body,
    version: note.version + 1,
    updatedAt: Date.now(),
  })
  return note.version + 1
}

export async function saveLayout(
  ctx: MutationCtx,
  layout: Doc<'gmLayouts'>,
  expectedVersion: number,
  value: LayoutState
) {
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
    .withIndex('by_screen', (q) => q.eq('screenId', layout.screenId))
    .take(GM_MAX_NOTES)
  const ids = new Set(value.placements.map((p) => p.noteId))
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
  await ctx.db.patch('gmLayouts', layout._id, {
    ...state,
    version: layout.version + 1,
    updatedAt: Date.now(),
  })
  return layout.version + 1
}
