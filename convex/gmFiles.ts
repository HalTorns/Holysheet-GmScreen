import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { FILE_QUOTA_BYTES, PROJECT_FILE_LIMIT } from '../shared/files'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { QueryCtx, MutationCtx } from './_generated/server'
import {
  internalQuery,
  internalMutation,
  mutation,
  query,
} from './_generated/server'
import { requireUser } from './lib/auth'
import { ownedProject, ownedNote, ownedScreen } from './lib/gmAccess'
import { fileMime, fileValidator } from './lib/gmValidators'
import { createNote } from './lib/gmWidgetWriting'
import { limitUserOperation } from './lib/rateLimits'

function usage(ctx: QueryCtx, ownerId: string) {
  return ctx.db
    .query('gmFileUsage')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .unique()
}
async function checkProjectLimit(ctx: QueryCtx, projectId: Id<'gmProjects'>) {
  // Includes trash: moving a file to trash never frees capacity or bytes.
  const files = await ctx.db
    .query('gmFiles')
    .withIndex('by_project_live', (q) => q.eq('projectId', projectId))
    .take(PROJECT_FILE_LIMIT)
  if (files.length >= PROJECT_FILE_LIMIT)
    throw new ConvexError({ code: 'PROJECT_FILE_LIMIT' })
}
export const authorizeUpload = internalQuery({
  args: { projectId: v.string() },
  returns: v.id('gmProjects'),
  handler: async (ctx, { projectId }) => {
    const user = await requireUser(ctx)
    const id = ctx.db.normalizeId('gmProjects', projectId)
    if (!id) throw new ConvexError({ code: 'NOT_FOUND' })
    await ownedProject(ctx, id, user._id)
    if (((await usage(ctx, user._id))?.bytes ?? 0) >= FILE_QUOTA_BYTES)
      throw new ConvexError({ code: 'STORAGE_QUOTA' })
    await checkProjectLimit(ctx, id)
    return id
  },
})
export const admitUpload = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    await limitUserOperation(ctx, 'fileUpload', user._id)
    return null
  },
})
export const registerUpload = internalMutation({
  args: {
    projectId: v.id('gmProjects'),
    storageId: v.id('_storage'),
    name: v.string(),
    mimeType: fileMime,
    size: v.number(),
  },
  returns: v.id('gmFiles'),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    await ownedProject(ctx, args.projectId, user._id)
    await checkProjectLimit(ctx, args.projectId)
    const current = await usage(ctx, user._id)
    if ((current?.bytes ?? 0) + args.size > FILE_QUOTA_BYTES)
      throw new ConvexError({ code: 'STORAGE_QUOTA' })
    if (current)
      await ctx.db.patch('gmFileUsage', current._id, {
        bytes: current.bytes + args.size,
      })
    else
      await ctx.db.insert('gmFileUsage', {
        ownerId: user._id,
        bytes: args.size,
      })
    return ctx.db.insert('gmFiles', {
      ...args,
      ownerId: user._id,
      name: args.name.trim().slice(0, 120) || 'Fichier',
      createdAt: Date.now(),
    })
  },
})
export const listFiles = query({
  args: {
    projectId: v.id('gmProjects'),
    trash: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(fileValidator),
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
  handler: async (ctx, { projectId, trash, paginationOpts }) => {
    const user = await requireUser(ctx)
    await ownedProject(ctx, projectId, user._id)
    return ctx.db
      .query('gmFiles')
      .withIndex('by_project_live', (q) =>
        trash
          ? q.eq('projectId', projectId).gt('deletedAt', 0)
          : q.eq('projectId', projectId).eq('deletedAt', undefined)
      )
      .paginate({
        ...paginationOpts,
        numItems: Math.min(20, Math.max(1, paginationOpts.numItems)),
      })
  },
})
export const getWidgetFile = query({
  args: { widgetId: v.id('gmNotes') },
  returns: v.union(
    v.null(),
    v.object({ url: v.string(), name: v.string(), mimeType: fileMime })
  ),
  handler: async (ctx, { widgetId }) => {
    const user = await requireUser(ctx)
    const widget = await ownedNote(ctx, widgetId, user._id)
    if (widget.kind !== 'image' && widget.kind !== 'pdf')
      throw new ConvexError({ code: 'INVALID_INPUT' })
    const file = widget.config.fileId
      ? await ctx.db.get('gmFiles', widget.config.fileId)
      : null
    if (
      !file ||
      file.ownerId !== user._id ||
      file.projectId !== widget.projectId ||
      file.deletedAt !== undefined ||
      (widget.kind === 'pdf') !== (file.mimeType === 'application/pdf')
    )
      return null
    const url = await ctx.storage.getUrl(file.storageId)
    return url ? { url, name: file.name, mimeType: file.mimeType } : null
  },
})
async function ownedFile(ctx: MutationCtx, id: Id<'gmFiles'>) {
  const user = await requireUser(ctx)
  const file = await ctx.db.get('gmFiles', id)
  if (!file || file.ownerId !== user._id)
    throw new ConvexError({ code: 'NOT_FOUND' })
  await ownedProject(ctx, file.projectId, user._id)
  await limitUserOperation(ctx, 'resourceWrite', user._id)
  return file
}
export const renameFile = mutation({
  args: { id: v.id('gmFiles'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    await ownedFile(ctx, id)
    if (!name.trim() || name.length > 120)
      throw new ConvexError({ code: 'INVALID_INPUT' })
    await ctx.db.patch('gmFiles', id, { name: name.trim() })
    return null
  },
})
export const setTrashed = mutation({
  args: { id: v.id('gmFiles'), trash: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { id, trash }) => {
    await ownedFile(ctx, id)
    await ctx.db.patch('gmFiles', id, {
      deletedAt: trash ? Date.now() : undefined,
    })
    return null
  },
})
export const purgeFile = mutation({
  args: { id: v.id('gmFiles') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const file = await ownedFile(ctx, id)
    if (file.deletedAt === undefined)
      throw new ConvexError({ code: 'INVALID_INPUT' })
    const current = await usage(ctx, file.ownerId)
    if (current)
      await ctx.db.patch('gmFileUsage', current._id, {
        bytes: Math.max(0, current.bytes - file.size),
      })
    await ctx.storage.delete(file.storageId)
    await ctx.db.delete('gmFiles', id)
    return null
  },
})
export const references = query({
  args: { id: v.id('gmFiles'), paginationOpts: paginationOptsValidator },
  returns: v.object({
    count: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { id, paginationOpts }) => {
    const user = await requireUser(ctx)
    const file = await ctx.db.get('gmFiles', id)
    if (!file || file.ownerId !== user._id)
      throw new ConvexError({ code: 'NOT_FOUND' })
    await ownedProject(ctx, file.projectId, user._id)
    const result = await ctx.db
      .query('gmNotes')
      .withIndex('by_project', (q) => q.eq('projectId', file.projectId))
      .paginate({ ...paginationOpts, numItems: 100 })
    return {
      count: result.page.filter(
        (w) =>
          (w.kind === 'image' || w.kind === 'pdf') && w.config.fileId === id
      ).length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    }
  },
})
export const purgeOrphans = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db.system
      .query('_storage')
      .paginate({ cursor, numItems: 100 })
    for (const blob of result.page) {
      if (blob._creationTime > Date.now() - 60 * 60 * 1000) continue
      const file = await ctx.db
        .query('gmFiles')
        .withIndex('by_storage', (q) => q.eq('storageId', blob._id))
        .unique()
      if (!file) await ctx.storage.delete(blob._id)
    }
    if (!result.isDone)
      await ctx.scheduler.runAfter(0, internal.gmFiles.purgeOrphans, {
        cursor: result.continueCursor,
      })
    return null
  },
})

export const placeFile = mutation({
  args: { screenId: v.id('gmScreens'), fileId: v.id('gmFiles') },
  returns: v.id('gmNotes'),
  handler: async (ctx, { screenId, fileId }) => {
    const user = await requireUser(ctx)
    const screen = await ownedScreen(ctx, screenId, user._id)
    const file = await ctx.db.get('gmFiles', fileId)
    if (
      !file ||
      file.ownerId !== user._id ||
      file.projectId !== screen.projectId ||
      file.deletedAt !== undefined
    )
      throw new ConvexError({ code: 'NOT_FOUND' })
    if (file.mimeType === 'application/pdf') {
      const id = await createNote(ctx, screenId, user._id, 'pdf')
      await ctx.db.patch('gmNotes', id, { config: { fileId } })
      return id
    }
    const id = await createNote(ctx, screenId, user._id, 'image')
    await ctx.db.patch('gmNotes', id, {
      config: { fileId, alt: '', fit: 'contain' },
    })
    return id
  },
})
