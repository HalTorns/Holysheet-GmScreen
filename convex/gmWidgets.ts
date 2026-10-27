import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { GM_MAX_LAYOUTS, GM_MAX_NOTES, GM_MAX_TRASH } from '../shared/gm'
import { withoutGroup } from '../shared/gm-geometry'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import { requireUser } from './lib/auth'
import { ownedLayout, ownedNote, ownedScreen } from './lib/gmAccess'
import { assertVersion, layoutState, recordHistory } from './lib/gmEditing'
import { noteValidator } from './lib/gmValidators'
import { limitUserOperation } from './lib/rateLimits'

const selectedNotes = v.array(
  v.object({ id: v.id('gmNotes'), version: v.number() })
)
async function writePlacements(
  ctx: MutationCtx,
  layout: Doc<'gmLayouts'>,
  placements: Doc<'gmLayouts'>['placements']
) {
  await recordHistory(ctx, layout, { kind: 'layout', ...layoutState(layout) })
  const order = [...placements].sort((a, b) => a.layer - b.layer)
  const ranks = new Map(order.map((p, index) => [p.noteId, index]))
  await ctx.db.patch('gmLayouts', layout._id, {
    placements: placements.map((p) => ({
      ...p,
      layer: ranks.get(p.noteId) ?? 0,
    })),
    version: layout.version + 1,
    updatedAt: Date.now(),
  })
}

// Bounded batch; source versions prevent a stale copy or delete from losing edits.
export const changeNotes = mutation({
  args: {
    layoutId: v.id('gmLayouts'),
    expectedVersion: v.number(),
    notes: selectedNotes,
    operation: v.union(v.literal('duplicate'), v.literal('trash')),
  },
  returns: v.array(v.id('gmNotes')),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const layout = await ownedLayout(ctx, args.layoutId, user._id)
    const screen = await ownedScreen(ctx, layout.screenId, user._id)
    if (screen.layoutLocked) throw new ConvexError({ code: 'LAYOUT_LOCKED' })
    if (layout.kind !== 'digital')
      throw new ConvexError({ code: 'INVALID_INPUT' })
    assertVersion(layout.version, args.expectedVersion)
    if (
      args.notes.length < 1 ||
      args.notes.length > 20 ||
      new Set(args.notes.map((n) => n.id)).size !== args.notes.length
    )
      throw new ConvexError({ code: 'INVALID_INPUT' })
    const sources: Doc<'gmNotes'>[] = []
    for (const selection of args.notes) {
      const note = await ownedNote(ctx, selection.id, user._id)
      if (note.screenId !== screen._id)
        throw new ConvexError({ code: 'INVALID_INPUT' })
      assertVersion(note.version, selection.version)
      sources.push(note)
    }
    const active = await ctx.db
      .query('gmNotes')
      .withIndex('by_screen_live', (q) =>
        q.eq('screenId', screen._id).eq('deletedAt', undefined)
      )
      .take(GM_MAX_NOTES)
    if (
      args.operation === 'duplicate' &&
      active.length + sources.length > GM_MAX_NOTES
    )
      throw new ConvexError({ code: 'SCREEN_LIMIT' })
    if (args.operation === 'trash') {
      const trashed = await ctx.db
        .query('gmNotes')
        .withIndex('by_screen_live', (q) =>
          q.eq('screenId', screen._id).gt('deletedAt', 0)
        )
        .take(GM_MAX_TRASH)
      if (trashed.length + sources.length > GM_MAX_TRASH)
        throw new ConvexError({ code: 'TRASH_LIMIT' })
    }
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    const layouts = await ctx.db
      .query('gmLayouts')
      .withIndex('by_screen', (q) => q.eq('screenId', screen._id))
      .take(GM_MAX_LAYOUTS)
    const created = new Map<string, Doc<'gmNotes'>['_id']>()
    for (const note of sources) {
      if (args.operation === 'duplicate') {
        const id = await ctx.db.insert('gmNotes', {
          ownerId: user._id,
          projectId: note.projectId,
          screenId: note.screenId,
          body: note.body,
          version: 0,
          updatedAt: Date.now(),
        })
        created.set(note._id, id)
      } else {
        const trashPlacements = layouts.flatMap((profile) =>
          profile.placements
            .filter((p) => p.noteId === note._id)
            .map(({ noteId: _noteId, ...geometry }) => ({
              layoutId: profile._id,
              ...geometry,
            }))
        )
        await ctx.db.patch('gmNotes', note._id, {
          deletedAt: Date.now(),
          trashPlacements,
          version: note.version + 1,
          updatedAt: Date.now(),
        })
      }
    }
    const ids = new Set(sources.map((n) => n._id))
    for (const profile of layouts) {
      let placements = profile.placements
      if (args.operation === 'trash') {
        placements = placements.filter((p) => !ids.has(p.noteId))
        // An orphaned member is no longer a group.
        placements = placements.map((p) =>
          p.groupId &&
          placements.filter((other) => other.groupId === p.groupId).length < 2
            ? withoutGroup(p)
            : p
        )
      } else {
        const copies = placements
          .filter((p) => ids.has(p.noteId))
          .map((p, index) => {
            const id = created.get(p.noteId)
            if (!id) throw new ConvexError({ code: 'INVALID_INPUT' })
            return {
              ...withoutGroup(p),
              noteId: id,
              x: Math.min(16_384, p.x + (profile.unit === 'mm' ? 4 : 24)),
              y: Math.min(16_384, p.y + (profile.unit === 'mm' ? 4 : 24)),
              layer: placements.length + index,
            }
          })
        placements = [...placements, ...copies]
      }
      await writePlacements(ctx, profile, placements)
    }
    return [...created.values()]
  },
})

export const listTrash = query({
  args: {
    screenId: v.id('gmScreens'),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(noteValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(
        v.literal('SplitRecommended'),
        v.literal('SplitRequired'),
        v.null()
      )
    ),
  }),
  handler: async (ctx, { screenId, paginationOpts }) => {
    const user = await requireUser(ctx)
    await ownedScreen(ctx, screenId, user._id)
    return ctx.db
      .query('gmNotes')
      .withIndex('by_screen_live', (q) =>
        q.eq('screenId', screenId).gt('deletedAt', 0)
      )
      .order('desc')
      .paginate({
        ...paginationOpts,
        numItems: Math.min(10, Math.max(1, paginationOpts.numItems)),
      })
  },
})

export const restoreNote = mutation({
  args: { id: v.id('gmNotes'), expectedVersion: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, expectedVersion }) => {
    const user = await requireUser(ctx)
    const note = await ctx.db.get('gmNotes', id)
    if (!note || note.ownerId !== user._id || note.deletedAt === undefined)
      throw new ConvexError({ code: 'NOT_FOUND' })
    const screen = await ownedScreen(ctx, note.screenId, user._id)
    if (screen.layoutLocked) throw new ConvexError({ code: 'LAYOUT_LOCKED' })
    assertVersion(note.version, expectedVersion)
    const active = await ctx.db
      .query('gmNotes')
      .withIndex('by_screen_live', (q) =>
        q.eq('screenId', note.screenId).eq('deletedAt', undefined)
      )
      .take(GM_MAX_NOTES)
    if (active.length >= GM_MAX_NOTES)
      throw new ConvexError({ code: 'SCREEN_LIMIT' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    const layouts = await ctx.db
      .query('gmLayouts')
      .withIndex('by_screen', (q) => q.eq('screenId', note.screenId))
      .take(GM_MAX_LAYOUTS)
    for (const layout of layouts) {
      const saved = note.trashPlacements?.find((p) => p.layoutId === layout._id)
      const factor = layout.unit === 'mm' ? 0.2 : 1
      const { layoutId: _layoutId, ...geometry } = saved ?? {
        layoutId: layout._id,
        x: 24 * factor,
        y: 24 * factor,
        width: Math.min(400 * factor, layout.width - 24 * factor),
        height: Math.min(240 * factor, layout.height - 24 * factor),
        layer: 0,
      }
      await writePlacements(ctx, layout, [
        ...layout.placements,
        {
          ...withoutGroup(geometry),
          noteId: id,
          layer: layout.placements.length,
        },
      ])
    }
    await ctx.db.patch('gmNotes', id, {
      deletedAt: undefined,
      trashPlacements: undefined,
      version: note.version + 1,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const purgeNote = mutation({
  args: {
    id: v.id('gmNotes'),
    expectedVersion: v.number(),
    confirmation: v.literal('DELETE_NOTE'),
  },
  returns: v.null(),
  handler: async (ctx, { id, expectedVersion }) => {
    const user = await requireUser(ctx)
    const note = await ctx.db.get('gmNotes', id)
    if (!note || note.ownerId !== user._id || note.deletedAt === undefined)
      throw new ConvexError({ code: 'NOT_FOUND' })
    const screen = await ownedScreen(ctx, note.screenId, user._id)
    if (screen.layoutLocked) throw new ConvexError({ code: 'LAYOUT_LOCKED' })
    assertVersion(note.version, expectedVersion)
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    const revisions = await ctx.db
      .query('gmEditorHistory')
      .withIndex('by_subject', (q) => q.eq('subjectId', id))
      .take(20)
    for (const revision of revisions)
      await ctx.db.delete('gmEditorHistory', revision._id)
    await ctx.db.delete('gmNotes', id)
    return null
  },
})
