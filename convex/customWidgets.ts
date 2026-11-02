import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { customDefinition, customState } from '../shared/custom-widget-protocol'
import { mutation, query } from './_generated/server'
import { requireUser } from './lib/auth'
import { ownedDefinition, validateCustomReference } from './lib/customWidgets'
import { ownedNote, ownedProject, ownedScreen } from './lib/gmAccess'
import { assertVersion } from './lib/gmEditing'
import { widgetBudget } from './lib/gmFormats'
import { customDefinitionValidator, customShape } from './lib/gmValidators'
import { createNote } from './lib/gmWidgetWriting'
import { limitUserOperation } from './lib/rateLimits'

const input = {
  name: v.string(),
  html: v.string(),
  css: v.string(),
  source: v.string(),
  compiled: v.string(),
  language: v.union(v.literal('js'), v.literal('ts')),
}
export const list = query({
  args: {
    projectId: v.id('gmProjects'),
    trash: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(customDefinitionValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { projectId, trash, paginationOpts }) => {
    const user = await requireUser(ctx)
    await ownedProject(ctx, projectId, user._id)
    return ctx.db
      .query('gmCustomWidgets')
      .withIndex('by_project_live', (q) =>
        trash
          ? q.eq('projectId', projectId).gt('deletedAt', 0)
          : q.eq('projectId', projectId).eq('deletedAt', undefined)
      )
      .paginate({
        ...paginationOpts,
        numItems: Math.min(10, Math.max(1, paginationOpts.numItems)),
      })
  },
})
export const save = mutation({
  args: {
    projectId: v.id('gmProjects'),
    id: v.optional(v.id('gmCustomWidgets')),
    expectedVersion: v.number(),
    ...input,
  },
  returns: v.id('gmCustomWidgets'),
  handler: async (ctx, { projectId, id, expectedVersion, ...raw }) => {
    const user = await requireUser(ctx)
    await ownedProject(ctx, projectId, user._id)
    const parsed = customDefinition.safeParse(raw)
    if (!parsed.success) throw new ConvexError({ code: 'INVALID_INPUT' })
    if (id) {
      const current = await ownedDefinition(ctx, id, user._id)
      if (current.projectId !== projectId || current.deletedAt !== undefined)
        throw new ConvexError({ code: 'NOT_FOUND' })
      assertVersion(current.version, expectedVersion)
      await limitUserOperation(ctx, 'resourceWrite', user._id)
      await ctx.db.patch('gmCustomWidgets', id, {
        ...parsed.data,
        version: current.version + 1,
      })
      return id
    }
    const existing = await ctx.db
      .query('gmCustomWidgets')
      .withIndex('by_project_live', (q) => q.eq('projectId', projectId))
      .take(101)
    if (existing.length >= 100) throw new ConvexError({ code: 'PROJECT_LIMIT' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    return ctx.db.insert('gmCustomWidgets', {
      ...parsed.data,
      projectId,
      ownerId: user._id,
      version: 0,
    })
  },
})
export const setTrashed = mutation({
  args: {
    id: v.id('gmCustomWidgets'),
    expectedVersion: v.number(),
    trashed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { id, expectedVersion, trashed }) => {
    const user = await requireUser(ctx)
    const definition = await ownedDefinition(ctx, id, user._id)
    assertVersion(definition.version, expectedVersion)
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    await ctx.db.patch('gmCustomWidgets', id, {
      deletedAt: trashed ? Date.now() : undefined,
      version: definition.version + 1,
    })
    return null
  },
})
export const purge = mutation({
  args: { id: v.id('gmCustomWidgets'), expectedVersion: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, expectedVersion }) => {
    const user = await requireUser(ctx)
    const definition = await ownedDefinition(ctx, id, user._id)
    assertVersion(definition.version, expectedVersion)
    if (definition.deletedAt === undefined)
      throw new ConvexError({ code: 'INVALID_INPUT' })
    const used = await ctx.db
      .query('gmNotes')
      .withIndex('by_custom_definition', (q) =>
        q.eq('config.definitionId', id).eq('deletedAt', undefined)
      )
      .first()
    if (used) throw new ConvexError({ code: 'IN_USE' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    await ctx.db.delete('gmCustomWidgets', id)
    return null
  },
})
export const place = mutation({
  args: { screenId: v.id('gmScreens'), definitionId: v.id('gmCustomWidgets') },
  returns: v.id('gmNotes'),
  handler: async (ctx, { screenId, definitionId }) => {
    const user = await requireUser(ctx)
    const screen = await ownedScreen(ctx, screenId, user._id)
    await validateCustomReference(ctx, definitionId, screen.projectId, user._id)
    const id = await createNote(
      ctx,
      screenId,
      user._id,
      'custom',
      undefined,
      undefined,
      definitionId
    )
    return id
  },
})
export const getForWidget = query({
  args: { widgetId: v.id('gmNotes') },
  returns: v.union(v.null(), customDefinitionValidator),
  handler: async (ctx, { widgetId }) => {
    const user = await requireUser(ctx)
    const widget = await ownedNote(ctx, widgetId, user._id)
    if (widget.kind !== 'custom' || !widget.config.definitionId) return null
    const definition = await ctx.db.get(
      'gmCustomWidgets',
      widget.config.definitionId
    )
    return definition &&
      definition.ownerId === user._id &&
      definition.projectId === widget.projectId &&
      definition.deletedAt === undefined
      ? definition
      : null
  },
})
export const saveState = mutation({
  args: {
    id: v.id('gmNotes'),
    expectedVersion: v.number(),
    state: customShape.state,
  },
  returns: v.number(),
  handler: async (ctx, { id, expectedVersion, state }) => {
    const user = await requireUser(ctx)
    const widget = await ownedNote(ctx, id, user._id)
    if (widget.kind !== 'custom')
      throw new ConvexError({ code: 'INVALID_INPUT' })
    assertVersion(widget.version, expectedVersion)
    await validateCustomReference(
      ctx,
      widget.config.definitionId,
      widget.projectId,
      user._id
    )
    const parsed = customState.safeParse(state)
    if (!parsed.success) throw new ConvexError({ code: 'INVALID_INPUT' })
    widgetBudget({ ...widget, state: parsed.data })
    await limitUserOperation(ctx, 'customWidgetWrite', user._id)
    await ctx.db.patch('gmNotes', id, {
      state: parsed.data,
      version: widget.version + 1,
      updatedAt: Date.now(),
    })
    return widget.version + 1
  },
})
