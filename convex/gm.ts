import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { GM_MAX_FOLDER_DEPTH, GM_MAX_LAYOUTS, gmTitle } from '../shared/gm'
import { mutation, query } from './_generated/server'
import { requireUser, requireAccountUser } from './lib/auth'
import { ownedProject, ownedNote } from './lib/gmAccess'
import { saveNote } from './lib/gmEditing'
import { normalizeLayout } from './lib/gmFormats'
import {
  folderValidator,
  gmCollection,
  gmDocument,
  normalizedLayoutValidator,
  projectValidator,
  screenValidator,
} from './lib/gmValidators'
import { createNote } from './lib/gmWidgetWriting'
import { limitUserOperation } from './lib/rateLimits'

const pageFields = {
  isDone: v.boolean(),
  continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(
    v.union(v.literal('SplitRecommended'), v.literal('SplitRequired'), v.null())
  ),
}
const pagination = { paginationOpts: paginationOptsValidator }

// Un contenu de fiche peut peser environ 400 ko en UTF-8 : 10 par page
// gardent l'export sous 4 Mo, loin du budget de 16 Mio par transaction.
function exportPageLimit(collection: string) {
  return [
    'gmNotes',
    'gmWidgetContents',
    'gmEditorHistory',
    'gmSheetContents',
  ].includes(collection)
    ? 10
    : 50
}

function title(value: string) {
  const result = gmTitle.safeParse(value)
  if (!result.success) throw new ConvexError({ code: 'INVALID_INPUT' })
  return result.data
}

export const listProjects = query({
  args: pagination,
  returns: v.object({ ...pageFields, page: v.array(projectValidator) }),
  handler: async (ctx, { paginationOpts }) => {
    const user = await requireUser(ctx)
    return ctx.db
      .query('gmProjects')
      .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
      .order('desc')
      .paginate({
        ...paginationOpts,
        numItems: Math.min(50, Math.max(1, paginationOpts.numItems)),
      })
  },
})

export const createProject = mutation({
  args: { title: v.string() },
  returns: v.id('gmProjects'),
  handler: async (ctx, input) => {
    const user = await requireUser(ctx)
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    return ctx.db.insert('gmProjects', {
      title: title(input.title),
      ownerId: user._id,
      archived: false,
      updatedAt: Date.now(),
    })
  },
})

export const getProject = query({
  args: { id: v.string() },
  returns: v.union(projectValidator, v.null()),
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx)
    const normalizedId = ctx.db.normalizeId('gmProjects', id)
    if (!normalizedId) return null
    const project = await ctx.db.get('gmProjects', normalizedId)
    return project?.ownerId === user._id ? project : null
  },
})

export const listFolders = query({
  args: {
    ...pagination,
    projectId: v.id('gmProjects'),
    parentId: v.optional(v.id('gmFolders')),
  },
  returns: v.object({ ...pageFields, page: v.array(folderValidator) }),
  handler: async (ctx, { projectId, parentId, paginationOpts }) => {
    const user = await requireUser(ctx)
    await ownedProject(ctx, projectId, user._id)
    return ctx.db
      .query('gmFolders')
      .withIndex('by_parent', (q) =>
        q.eq('projectId', projectId).eq('parentId', parentId)
      )
      .paginate({
        ...paginationOpts,
        numItems: Math.min(50, Math.max(1, paginationOpts.numItems)),
      })
  },
})

export const createFolder = mutation({
  args: {
    projectId: v.id('gmProjects'),
    parentId: v.optional(v.id('gmFolders')),
    title: v.string(),
  },
  returns: v.id('gmFolders'),
  handler: async (ctx, { projectId, parentId, title: input }) => {
    const user = await requireUser(ctx)
    await ownedProject(ctx, projectId, user._id)
    const parent = parentId ? await ctx.db.get('gmFolders', parentId) : null
    if (
      parentId &&
      (!parent || parent.ownerId !== user._id || parent.projectId !== projectId)
    )
      throw new ConvexError({ code: 'NOT_FOUND' })
    const depth = (parent?.depth ?? 0) + 1
    if (depth > GM_MAX_FOLDER_DEPTH)
      throw new ConvexError({ code: 'FOLDER_DEPTH_LIMIT' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    return ctx.db.insert('gmFolders', {
      ownerId: user._id,
      projectId,
      ...(parentId ? { parentId } : {}),
      title: title(input),
      depth,
      updatedAt: Date.now(),
    })
  },
})

export const listScreens = query({
  args: {
    ...pagination,
    projectId: v.id('gmProjects'),
    folderId: v.optional(v.id('gmFolders')),
  },
  returns: v.object({ ...pageFields, page: v.array(screenValidator) }),
  handler: async (ctx, { projectId, folderId, paginationOpts }) => {
    const user = await requireUser(ctx)
    await ownedProject(ctx, projectId, user._id)
    return ctx.db
      .query('gmScreens')
      .withIndex('by_folder', (q) =>
        q.eq('projectId', projectId).eq('folderId', folderId)
      )
      .paginate({
        ...paginationOpts,
        numItems: Math.min(50, Math.max(1, paginationOpts.numItems)),
      })
  },
})

export const createScreen = mutation({
  args: {
    projectId: v.id('gmProjects'),
    folderId: v.optional(v.id('gmFolders')),
    title: v.string(),
    format: v.union(v.literal('digital'), v.literal('a4-landscape')),
  },
  returns: v.id('gmScreens'),
  handler: async (ctx, { projectId, folderId, title: input, format }) => {
    const user = await requireUser(ctx)
    await ownedProject(ctx, projectId, user._id)
    if (folderId) {
      const folder = await ctx.db.get('gmFolders', folderId)
      if (
        !folder ||
        folder.projectId !== projectId ||
        folder.ownerId !== user._id
      )
        throw new ConvexError({ code: 'NOT_FOUND' })
    }
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    const common = { ownerId: user._id, projectId, updatedAt: Date.now() }
    const screenId = await ctx.db.insert('gmScreens', {
      ...common,
      title: title(input),
      ...(folderId ? { folderId } : {}),
    })
    await ctx.db.insert('gmLayouts', {
      ...common,
      screenId,
      name: 'Bureau',
      kind: 'digital',
      unit: 'px',
      width: format === 'digital' ? 1920 : 1123,
      height: format === 'digital' ? 1080 : 794,
      formatVersion: 2,
      placements: [],
      version: 0,
    })
    await ctx.db.insert('gmLayouts', {
      ...common,
      screenId,
      name: 'A4 paysage',
      kind: 'print',
      unit: 'mm',
      width: 297,
      height: 210,
      formatVersion: 2,
      placements: [],
      version: 0,
    })
    return screenId
  },
})

export const getScreen = query({
  args: { id: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      screen: screenValidator,
      layouts: v.array(normalizedLayoutValidator),
    })
  ),
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx)
    const normalizedId = ctx.db.normalizeId('gmScreens', id)
    if (!normalizedId) return null
    const screen = await ctx.db.get('gmScreens', normalizedId)
    if (!screen || screen.ownerId !== user._id) return null
    await ownedProject(ctx, screen.projectId, user._id)
    const layouts = await ctx.db
      .query('gmLayouts')
      .withIndex('by_screen', (q) => q.eq('screenId', normalizedId))
      .take(GM_MAX_LAYOUTS)
    return { screen, layouts: layouts.map(normalizeLayout) }
  },
})

export const addNote = mutation({
  args: { screenId: v.id('gmScreens') },
  returns: v.id('gmNotes'),
  handler: async (ctx, { screenId }) => {
    const user = await requireUser(ctx)
    return createNote(ctx, screenId, user._id)
  },
})

export const updateNote = mutation({
  args: { id: v.id('gmNotes'), expectedVersion: v.number(), body: v.string() },
  returns: v.number(),
  handler: async (ctx, { id, expectedVersion, body }) => {
    const user = await requireUser(ctx)
    const note = await ownedNote(ctx, id, user._id)
    return saveNote(ctx, note, expectedVersion, body)
  },
})

export const exportCollection = query({
  args: { ...pagination, collection: gmCollection },
  returns: v.object({ ...pageFields, page: v.array(gmDocument) }),
  handler: async (ctx, { collection, paginationOpts }) => {
    const user = await requireAccountUser(ctx)
    return ctx.db
      .query(collection)
      .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
      .paginate({
        ...paginationOpts,
        numItems: Math.min(
          exportPageLimit(collection),
          Math.max(1, paginationOpts.numItems)
        ),
      })
  },
})
