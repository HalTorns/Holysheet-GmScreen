import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { gmTitle, GM_MAX_LAYOUTS } from '../shared/gm'
import { mutation, query } from './_generated/server'
import { requireUser } from './lib/auth'
import { ownedLayout, ownedNote, ownedScreen } from './lib/gmAccess'
import { layoutState, saveLayout, saveNote } from './lib/gmEditing'
import {
  digitalLayoutFields,
  historyTarget,
  historyValidator,
} from './lib/gmValidators'
import { limitUserOperation } from './lib/rateLimits'

export const updateLayout = mutation({
  args: {
    id: v.id('gmLayouts'),
    expectedVersion: v.number(),
    ...digitalLayoutFields,
  },
  returns: v.number(),
  handler: async (ctx, { id, expectedVersion, ...state }) => {
    const user = await requireUser(ctx)
    const layout = await ownedLayout(ctx, id, user._id)
    return saveLayout(ctx, layout, expectedVersion, state)
  },
})

export const createProfile = mutation({
  args: { sourceId: v.id('gmLayouts'), name: v.string() },
  returns: v.id('gmLayouts'),
  handler: async (ctx, { sourceId, name }) => {
    const user = await requireUser(ctx)
    const source = await ownedLayout(ctx, sourceId, user._id)
    const screen = await ownedScreen(ctx, source.screenId, user._id)
    if (screen.layoutLocked) throw new ConvexError({ code: 'LAYOUT_LOCKED' })
    const title = gmTitle.safeParse(name)
    if (source.kind !== 'digital' || !title.success)
      throw new ConvexError({ code: 'INVALID_INPUT' })
    const profiles = await ctx.db
      .query('gmLayouts')
      .withIndex('by_screen', (q) => q.eq('screenId', source.screenId))
      .take(GM_MAX_LAYOUTS)
    if (profiles.length >= GM_MAX_LAYOUTS)
      throw new ConvexError({ code: 'LAYOUT_LIMIT' })
    if (
      profiles.some(
        (p) =>
          p.kind === 'digital' &&
          p.name.toLocaleLowerCase('fr') === title.data.toLocaleLowerCase('fr')
      )
    )
      throw new ConvexError({ code: 'LAYOUT_NAME_TAKEN' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    return ctx.db.insert('gmLayouts', {
      ...layoutState(source),
      name: title.data,
      ownerId: user._id,
      projectId: source.projectId,
      screenId: source.screenId,
      kind: 'digital',
      unit: 'px',
      version: 0,
      updatedAt: Date.now(),
    })
  },
})

export const setLayoutLocked = mutation({
  args: { screenId: v.id('gmScreens'), locked: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { screenId, locked }) => {
    const user = await requireUser(ctx)
    await ownedScreen(ctx, screenId, user._id)
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    await ctx.db.patch('gmScreens', screenId, {
      layoutLocked: locked,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const listHistory = query({
  args: { target: historyTarget, paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(historyValidator),
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
  handler: async (ctx, { target, paginationOpts }) => {
    const user = await requireUser(ctx)
    if (target.kind === 'note') await ownedNote(ctx, target.id, user._id)
    else await ownedLayout(ctx, target.id, user._id)
    return ctx.db
      .query('gmEditorHistory')
      .withIndex('by_subject', (q) => q.eq('subjectId', target.id))
      .order('desc')
      .paginate({
        ...paginationOpts,
        numItems: Math.min(10, Math.max(1, paginationOpts.numItems)),
      })
  },
})

export const restoreRevision = mutation({
  args: { id: v.id('gmEditorHistory'), expectedVersion: v.number() },
  returns: v.number(),
  handler: async (ctx, { id, expectedVersion }) => {
    const user = await requireUser(ctx)
    const revision = await ctx.db.get('gmEditorHistory', id)
    if (!revision || revision.ownerId !== user._id)
      throw new ConvexError({ code: 'NOT_FOUND' })
    const snapshot = revision.snapshot
    if (snapshot.kind === 'note') {
      const noteId = ctx.db.normalizeId('gmNotes', revision.subjectId)
      if (!noteId) throw new ConvexError({ code: 'NOT_FOUND' })
      const note = await ownedNote(ctx, noteId, user._id)
      if (note.screenId !== revision.screenId)
        throw new ConvexError({ code: 'NOT_FOUND' })
      return saveNote(ctx, note, expectedVersion, snapshot.body)
    }
    const layoutId = ctx.db.normalizeId('gmLayouts', revision.subjectId)
    if (!layoutId) throw new ConvexError({ code: 'NOT_FOUND' })
    const layout = await ownedLayout(ctx, layoutId, user._id)
    if (layout.screenId !== revision.screenId)
      throw new ConvexError({ code: 'NOT_FOUND' })
    // Restoring geometry never removes notes added since the snapshot.
    const placements = layout.placements.map(
      (current) =>
        snapshot.placements.find(
          (previous) => previous.noteId === current.noteId
        ) ?? current
    )
    return saveLayout(ctx, layout, expectedVersion, {
      ...layoutState(snapshot),
      placements,
    })
  },
})
