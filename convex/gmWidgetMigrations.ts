import { Migrations } from '@convex-dev/migrations'
import { ConvexError, v } from 'convex/values'

import { GM_CONTENT_BYTES, GM_LAYOUT_BYTES } from '../shared/gm'
import { components, internal } from './_generated/api'
import { internalQuery, internalMutation } from './_generated/server'
import {
  convertNote,
  normalizeLayout,
  normalizePlacement,
  normalizeSnapshot,
  layoutBudget,
  assertBudget,
} from './lib/gmFormats'
import schema from './schema'

const migrations = new Migrations(components.migrations, {
  schema,
  defaultBatchSize: 5,
})
export const notes = migrations.define({
  table: 'gmNotes',
  migrateOne: async (ctx, note) => {
    await convertNote(ctx, note)
  },
})
export const layouts = migrations.define({
  table: 'gmLayouts',
  migrateOne: async (ctx, layout) => {
    if (layout.formatVersion === 2) return
    const normalized = layoutBudget(normalizeLayout(layout))
    await ctx.db.patch('gmLayouts', layout._id, {
      formatVersion: 2,
      placements: normalized.placements,
    })
  },
})
export const history = migrations.define({
  table: 'gmEditorHistory',
  migrateOne: async (ctx, revision) => {
    if (revision.formatVersion === 2) return
    const snapshot = normalizeSnapshot(revision.snapshot)
    assertBudget(
      { ...revision, snapshot },
      snapshot.kind === 'note' ? GM_CONTENT_BYTES : GM_LAYOUT_BYTES
    )
    await ctx.db.patch('gmEditorHistory', revision._id, {
      formatVersion: 2,
      snapshot,
    })
  },
})
export const runner = migrations.runner()
export const run = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.runMutation(internal.gmWidgetMigrations.runner, {
      fn: 'gmWidgetMigrations:notes',
      next: ['gmWidgetMigrations:layouts', 'gmWidgetMigrations:history'],
    })
    return null
  },
})

// One primary document and at most five referenced widgets per call. In
// particular, never fan out over 100 potentially 200 KiB legacy note bodies.
export const inventory = internalQuery({
  args: {
    table: v.union(
      v.literal('gmNotes'),
      v.literal('gmWidgetContents'),
      v.literal('gmLayouts'),
      v.literal('gmEditorHistory')
    ),
    cursor: v.union(v.string(), v.null()),
    offset: v.optional(v.number()),
  },
  returns: v.object({
    counters: v.record(v.string(), v.number()),
    samples: v.array(v.string()),
    continueCursor: v.union(v.string(), v.null()),
    offset: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { table, cursor, offset = 0 }) => {
    if (!Number.isInteger(offset) || offset < 0 || offset > 100)
      throw new ConvexError({ code: 'INVALID_INPUT' })
    const counters: Record<string, number> = {
      scanned: 0,
      v1: 0,
      duplicatePayloads: 0,
      orphanPayloads: 0,
      notesWithoutPayload: 0,
      payloadKindMismatch: 0,
      payloadOwnerMismatch: 0,
      payloadProjectMismatch: 0,
      payloadScreenMismatch: 0,
      placementAbsent: 0,
      placementOwnerMismatch: 0,
      placementProjectMismatch: 0,
      placementScreenMismatch: 0,
      historySubjectAbsent: 0,
      historySubjectOwnerMismatch: 0,
      oldLayoutPurgedReferences: 0,
    }
    const samples: string[] = []
    function count(key: keyof typeof counters, id: string) {
      counters[key] = (counters[key] ?? 0) + 1
      if (samples.length < 3 && !samples.includes(id)) samples.push(id)
    }
    const result = await ctx.db.query(table).paginate({ cursor, numItems: 1 })
    const doc = result.page[0]
    let remaining = false
    if (doc) {
      if (offset === 0) {
        counters.scanned = 1
        if ('formatVersion' in doc && doc.formatVersion !== 2)
          count('v1', doc._id)
        // Legacy documents may omit formatVersion altogether.
        if (!('formatVersion' in doc)) count('v1', doc._id)
      }
      if ('widgetId' in doc) {
        const widget = await ctx.db.get('gmNotes', doc.widgetId)
        const first = await ctx.db
          .query('gmWidgetContents')
          .withIndex('by_widget', (q) => q.eq('widgetId', doc.widgetId))
          .first()
        // Count excess documents, once each, even across page boundaries.
        if (first && first._id !== doc._id) count('duplicatePayloads', doc._id)
        if (!widget) count('orphanPayloads', doc._id)
        if (widget) {
          if (widget.formatVersion !== 2 || widget.kind !== 'note')
            count('payloadKindMismatch', doc._id)
          if (widget.ownerId !== doc.ownerId)
            count('payloadOwnerMismatch', doc._id)
          if (widget.projectId !== doc.projectId)
            count('payloadProjectMismatch', doc._id)
          if (widget.screenId !== doc.screenId)
            count('payloadScreenMismatch', doc._id)
        }
      } else if ('subjectId' in doc) {
        if (doc.snapshot.kind === 'layout') {
          const placements = doc.snapshot.placements
          for (const placement of placements.slice(offset, offset + 5)) {
            const widget = await ctx.db.get(
              'gmNotes',
              normalizePlacement(placement).widgetId
            )
            if (!widget) count('oldLayoutPurgedReferences', doc._id)
          }
          remaining = offset + 5 < placements.length
        } else {
          const id = ctx.db.normalizeId('gmNotes', doc.subjectId)
          const widget = id ? await ctx.db.get('gmNotes', id) : null
          if (!widget) count('historySubjectAbsent', doc._id)
          else if (widget.ownerId !== doc.ownerId)
            count('historySubjectOwnerMismatch', doc._id)
        }
      } else if ('placements' in doc) {
        for (const placement of doc.placements.slice(offset, offset + 5)) {
          const widget = await ctx.db.get(
            'gmNotes',
            normalizePlacement(placement).widgetId
          )
          if (!widget) count('placementAbsent', doc._id)
          if (widget) {
            if (widget.ownerId !== doc.ownerId)
              count('placementOwnerMismatch', doc._id)
            if (widget.projectId !== doc.projectId)
              count('placementProjectMismatch', doc._id)
            if (widget.screenId !== doc.screenId)
              count('placementScreenMismatch', doc._id)
          }
        }
        remaining = offset + 5 < doc.placements.length
      } else if (doc.formatVersion === 2 && doc.kind === 'note') {
        const content = await ctx.db
          .query('gmWidgetContents')
          .withIndex('by_widget', (q) => q.eq('widgetId', doc._id))
          .first()
        if (!content) count('notesWithoutPayload', doc._id)
      }
    }
    return {
      counters,
      samples,
      continueCursor: remaining ? cursor : result.continueCursor,
      offset: remaining ? offset + 5 : 0,
      isDone: !remaining && result.isDone,
    }
  },
})
