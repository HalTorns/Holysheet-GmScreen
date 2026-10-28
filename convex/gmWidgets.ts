import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { GM_MAX_LAYOUTS, GM_MAX_NOTES, GM_MAX_TRASH } from '../shared/gm'
import { withoutGroup } from '../shared/gm-geometry'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import { requireUser } from './lib/auth'
import { ownedLayout, ownedNote, ownedScreen } from './lib/gmAccess'
import {
  assertVersion,
  layoutState,
  recordHistory,
  saveNote,
} from './lib/gmEditing'
import type { Widget } from './lib/gmFormats'
import {
  normalizeWidget,
  normalizeLayout,
  normalizePlacement,
  noteBody,
  writeContent,
  requireMigratedScreen,
  widgetBudget,
  layoutBudget,
  convertNote,
} from './lib/gmFormats'
import {
  widgetValidator,
  widgetKindValidator,
  widgetUpdateValidator,
  trashWidgetValidator,
} from './lib/gmValidators'
import { saveWidget } from './lib/gmWidgetState'
import { createNote } from './lib/gmWidgetWriting'
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
  const normalized = placements.map(normalizePlacement)
  const order = [...normalized].sort((a, b) => a.layer - b.layer)
  const ranks = new Map(order.map((p, index) => [p.widgetId, index]))
  layoutBudget(normalizeLayout({ ...layout, placements: normalized }))
  await ctx.db.patch('gmLayouts', layout._id, {
    formatVersion: 2,
    placements: normalized.map((p) => ({
      ...p,
      layer: ranks.get(p.widgetId) ?? 0,
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
    await requireMigratedScreen(ctx, screen._id)
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
      .take(GM_MAX_NOTES + 1)
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
        .take(GM_MAX_TRASH + 1)
      if (trashed.length + sources.length > GM_MAX_TRASH)
        throw new ConvexError({ code: 'TRASH_LIMIT' })
    }
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    const layouts = await ctx.db
      .query('gmLayouts')
      .withIndex('by_screen', (q) => q.eq('screenId', screen._id))
      .take(GM_MAX_LAYOUTS)
    const profiles = layouts.map(normalizeLayout)
    const created = new Map<string, Doc<'gmNotes'>['_id']>()
    for (const note of sources) {
      if (args.operation === 'duplicate') {
        const id = await ctx.db.insert('gmNotes', {
          ownerId: user._id,
          projectId: note.projectId,
          screenId: note.screenId,
          formatVersion: 2,
          ...widgetDefinition(normalizeWidget(note)),
          version: 0,
          updatedAt: Date.now(),
        })
        const copy = await ctx.db.get('gmNotes', id)
        if (!copy) throw new ConvexError({ code: 'NOT_FOUND' })
        if (normalizeWidget(note).kind === 'note')
          await writeContent(
            ctx,
            widgetBudget(normalizeWidget(copy)),
            await noteBody(ctx, note)
          )
        created.set(note._id, id)
      } else {
        const trashPlacements = profiles.flatMap((profile) =>
          profile.placements
            .filter((p) => p.widgetId === note._id)
            .map(({ widgetId: _widgetId, ...geometry }) => ({
              layoutId: profile._id,
              ...geometry,
            }))
        )
        widgetBudget({
          ...normalizeWidget(note),
          deletedAt: Date.now(),
          trashPlacements,
        })
        await ctx.db.patch('gmNotes', note._id, {
          deletedAt: Date.now(),
          trashPlacements,
          version: note.version + 1,
          updatedAt: Date.now(),
        })
      }
    }
    const ids = new Set(sources.map((n) => n._id))
    for (const profile of profiles) {
      let placements = profile.placements
      if (args.operation === 'trash') {
        placements = placements.filter((p) => !ids.has(p.widgetId))
        // An orphaned member is no longer a group.
        placements = placements.map((p) =>
          p.groupId &&
          placements.filter((other) => other.groupId === p.groupId).length < 2
            ? withoutGroup(p)
            : p
        )
      } else {
        const copies = placements
          .filter((p) => ids.has(p.widgetId))
          .map((p, index) => {
            const id = created.get(p.widgetId)
            if (!id) throw new ConvexError({ code: 'INVALID_INPUT' })
            return {
              ...withoutGroup(p),
              widgetId: id,
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
    page: v.array(trashWidgetValidator),
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
    const result = await ctx.db
      .query('gmNotes')
      .withIndex('by_screen_live', (q) =>
        q.eq('screenId', screenId).gt('deletedAt', 0)
      )
      .order('desc')
      .paginate({
        ...paginationOpts,
        numItems: Math.min(10, Math.max(1, paginationOpts.numItems)),
      })
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (note) => ({
          ...normalizeWidget(note),
          preview:
            normalizeWidget(note).kind === 'note'
              ? (await noteBody(ctx, note)).slice(0, 240)
              : widgetPreview(normalizeWidget(note)),
        }))
      ),
    }
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
    await requireMigratedScreen(ctx, screen._id)
    if (screen.layoutLocked) throw new ConvexError({ code: 'LAYOUT_LOCKED' })
    assertVersion(note.version, expectedVersion)
    await convertNote(ctx, note)
    const active = await ctx.db
      .query('gmNotes')
      .withIndex('by_screen_live', (q) =>
        q.eq('screenId', note.screenId).eq('deletedAt', undefined)
      )
      .take(GM_MAX_NOTES + 1)
    if (active.length >= GM_MAX_NOTES)
      throw new ConvexError({ code: 'SCREEN_LIMIT' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    const layouts = await ctx.db
      .query('gmLayouts')
      .withIndex('by_screen', (q) => q.eq('screenId', note.screenId))
      .take(GM_MAX_LAYOUTS)
    const profiles = layouts.map(normalizeLayout)
    for (const layout of profiles) {
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
          widgetId: id,
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
    await requireMigratedScreen(ctx, screen._id)
    if (screen.layoutLocked) throw new ConvexError({ code: 'LAYOUT_LOCKED' })
    assertVersion(note.version, expectedVersion)
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    const revisions = await ctx.db
      .query('gmEditorHistory')
      .withIndex('by_subject', (q) => q.eq('subjectId', id))
      .take(20)
    for (const revision of revisions)
      await ctx.db.delete('gmEditorHistory', revision._id)
    const content = await ctx.db
      .query('gmWidgetContents')
      .withIndex('by_widget', (q) => q.eq('widgetId', id))
      .unique()
    if (content) await ctx.db.delete('gmWidgetContents', content._id)
    await ctx.db.delete('gmNotes', id)
    return null
  },
})

export const listScreenWidgets = query({
  args: {
    screenId: v.id('gmScreens'),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(widgetValidator),
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
    const result = await ctx.db
      .query('gmNotes')
      .withIndex('by_screen_live', (q) =>
        q.eq('screenId', screenId).eq('deletedAt', undefined)
      )
      .paginate({
        ...paginationOpts,
        numItems: Math.min(10, Math.max(1, paginationOpts.numItems)),
      })
    return { ...result, page: result.page.map(normalizeWidget) }
  },
})
export const getNoteContent = query({
  args: { id: v.id('gmNotes') },
  returns: v.object({ body: v.string(), version: v.number() }),
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx)
    const note = await ownedNote(ctx, id, user._id)
    return { body: await noteBody(ctx, note), version: note.version }
  },
})

export const addWidget = mutation({
  args: { screenId: v.id('gmScreens'), kind: widgetKindValidator },
  returns: v.id('gmNotes'),
  handler: async (ctx, { screenId, kind }) => {
    const user = await requireUser(ctx)
    return createNote(ctx, screenId, user._id, kind)
  },
})
export const updateWidget = mutation({
  args: {
    id: v.id('gmNotes'),
    expectedVersion: v.number(),
    widget: widgetUpdateValidator,
  },
  returns: v.number(),
  handler: async (ctx, { id, expectedVersion, widget: input }) => {
    const user = await requireUser(ctx)
    const widget = await ownedNote(ctx, id, user._id)
    if (input.kind === 'note') {
      if (normalizeWidget(widget).kind !== 'note')
        throw new ConvexError({ code: 'INVALID_INPUT' })
      return saveNote(ctx, widget, expectedVersion, input.body)
    }
    return saveWidget(ctx, widget, expectedVersion, input)
  },
})
export const setChecklistItem = mutation({
  args: {
    id: v.id('gmNotes'),
    expectedVersion: v.number(),
    itemId: v.string(),
    checked: v.boolean(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const widget = normalizeWidget(await ownedNote(ctx, args.id, user._id))
    if (
      widget.kind !== 'checklist' ||
      !widget.config.items.some((item) => item.id === args.itemId)
    )
      throw new ConvexError({ code: 'INVALID_INPUT' })
    const ids = new Set(widget.state.checkedIds)
    if (args.checked) ids.add(args.itemId)
    else ids.delete(args.itemId)
    return saveWidget(ctx, widget, args.expectedVersion, {
      kind: widget.kind,
      config: widget.config,
      state: { checkedIds: [...ids] },
    })
  },
})
export const setCounterValue = mutation({
  args: { id: v.id('gmNotes'), expectedVersion: v.number(), value: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const widget = normalizeWidget(await ownedNote(ctx, args.id, user._id))
    if (widget.kind !== 'counter' || widget.config.source.type !== 'local')
      throw new ConvexError({ code: 'INVALID_INPUT' })
    return saveWidget(ctx, widget, args.expectedVersion, {
      kind: widget.kind,
      config: widget.config,
      state: { value: args.value },
    })
  },
})

function widgetDefinition(widget: Widget) {
  if (widget.kind === 'note')
    return { kind: widget.kind, config: widget.config, state: widget.state }
  if (widget.kind === 'checklist')
    return { kind: widget.kind, config: widget.config, state: widget.state }
  if (widget.kind === 'counter')
    return { kind: widget.kind, config: widget.config, state: widget.state }
  return { kind: widget.kind, config: widget.config, state: widget.state }
}
function widgetPreview(widget: Widget) {
  if (widget.kind === 'note') return ''
  return widget.config.title || widget.kind
}
