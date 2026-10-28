import { Migrations } from '@convex-dev/migrations'
import { v } from 'convex/values'

import { GM_CONTENT_BYTES, GM_LAYOUT_BYTES } from '../shared/gm'
import { components, internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import {
  convertNote,
  normalizeLayout,
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
