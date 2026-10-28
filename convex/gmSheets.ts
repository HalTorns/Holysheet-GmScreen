import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import {
  GM_MAX_SHEETS,
  GM_MAX_SHEET_LINKS,
  GM_MAX_TRASH,
  gmSheetContent,
  gmSheetSearch,
  gmTitle,
} from '../shared/gm'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import { requireUser } from './lib/auth'
import { ownedProject, ownedSheet } from './lib/gmAccess'
import {
  sheetFieldValidator,
  sheetKindValidator,
  sheetValidator,
} from './lib/gmValidators'
import { limitUserOperation } from './lib/rateLimits'

// Les listes, la recherche, les liens et les quotas ne lisent que gmSheets
// (métadonnées légères) ; le contenu lourd est lu une fiche à la fois.
const pageFields = {
  isDone: v.boolean(),
  continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(
    v.union(v.literal('SplitRecommended'), v.literal('SplitRequired'), v.null())
  ),
}
const linkSummary = v.object({
  _id: v.id('gmSheets'),
  title: v.string(),
  kind: sheetKindValidator,
})

async function liveSheetCount(ctx: QueryCtx, projectId: Id<'gmProjects'>) {
  const live = await ctx.db
    .query('gmSheets')
    .withIndex('by_project_live', (q) =>
      q.eq('projectId', projectId).eq('deletedAt', undefined)
    )
    .take(GM_MAX_SHEETS + 1)
  return live.length
}

async function trashedSheetCount(ctx: QueryCtx, projectId: Id<'gmProjects'>) {
  const trashed = await ctx.db
    .query('gmSheets')
    .withIndex('by_project_live', (q) =>
      q.eq('projectId', projectId).gt('deletedAt', 0)
    )
    .take(GM_MAX_TRASH + 1)
  return trashed.length
}

async function contentOf(ctx: QueryCtx, sheetId: Id<'gmSheets'>) {
  const content = await ctx.db
    .query('gmSheetContents')
    .withIndex('by_sheet', (q) => q.eq('sheetId', sheetId))
    .unique()
  if (!content) throw new ConvexError({ code: 'NOT_FOUND' })
  return content
}

function summarize(sheet: Doc<'gmSheets'>) {
  return { _id: sheet._id, title: sheet.title, kind: sheet.kind }
}

export const listSheets = query({
  args: {
    paginationOpts: paginationOptsValidator,
    projectId: v.id('gmProjects'),
    kind: v.optional(sheetKindValidator),
    trashed: v.optional(v.boolean()),
  },
  returns: v.object({ ...pageFields, page: v.array(sheetValidator) }),
  handler: async (ctx, { projectId, kind, trashed, paginationOpts }) => {
    const user = await requireUser(ctx)
    await ownedProject(ctx, projectId, user._id)
    const page = {
      ...paginationOpts,
      numItems: Math.min(50, Math.max(1, paginationOpts.numItems)),
    }
    if (trashed)
      return ctx.db
        .query('gmSheets')
        .withIndex('by_project_live', (q) =>
          q.eq('projectId', projectId).gt('deletedAt', 0)
        )
        .order('desc')
        .paginate(page)
    if (kind)
      return ctx.db
        .query('gmSheets')
        .withIndex('by_project_kind_live', (q) =>
          q
            .eq('projectId', projectId)
            .eq('kind', kind)
            .eq('deletedAt', undefined)
        )
        .order('desc')
        .paginate(page)
    return ctx.db
      .query('gmSheets')
      .withIndex('by_project_live', (q) =>
        q.eq('projectId', projectId).eq('deletedAt', undefined)
      )
      .order('desc')
      .paginate(page)
  },
})

export const searchSheets = query({
  args: { projectId: v.id('gmProjects'), text: v.string() },
  returns: v.array(linkSummary),
  handler: async (ctx, { projectId, text }) => {
    const user = await requireUser(ctx)
    await ownedProject(ctx, projectId, user._id)
    const search = gmSheetSearch.safeParse(text)
    if (!search.success) return []
    const sheets = await ctx.db
      .query('gmSheets')
      .withSearchIndex('search_title', (q) =>
        q
          .search('title', search.data)
          .eq('projectId', projectId)
          .eq('deletedAt', undefined)
      )
      .take(20)
    return sheets.map(summarize)
  },
})

export const getSheet = query({
  args: { id: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      sheet: sheetValidator,
      body: v.string(),
      fields: v.array(sheetFieldValidator),
      links: v.array(linkSummary),
      backlinks: v.array(linkSummary),
    })
  ),
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx)
    const sheetId = ctx.db.normalizeId('gmSheets', id)
    if (!sheetId) return null
    const sheet = await ctx.db.get('gmSheets', sheetId)
    if (!sheet || sheet.ownerId !== user._id) return null
    await ownedProject(ctx, sheet.projectId, user._id)
    const content = await contentOf(ctx, sheetId)
    const outgoing = await ctx.db
      .query('gmSheetLinks')
      .withIndex('by_from', (q) => q.eq('fromId', sheetId))
      .take(GM_MAX_SHEET_LINKS)
    const incoming = await ctx.db
      .query('gmSheetLinks')
      .withIndex('by_to', (q) => q.eq('toId', sheetId))
      .take(GM_MAX_SHEET_LINKS)
    // Un lien vers ou depuis une fiche en corbeille reste stocké mais masqué.
    const resolve = async (ids: Id<'gmSheets'>[]) => {
      const sheets = await Promise.all(
        ids.map((linked) => ctx.db.get('gmSheets', linked))
      )
      return sheets
        .filter(
          (linked): linked is Doc<'gmSheets'> =>
            linked !== null &&
            linked.ownerId === user._id &&
            linked.deletedAt === undefined
        )
        .map(summarize)
    }
    return {
      sheet,
      body: content.body,
      fields: content.fields,
      links: await resolve(outgoing.map((link) => link.toId)),
      backlinks: await resolve(incoming.map((link) => link.fromId)),
    }
  },
})

export const createSheet = mutation({
  args: {
    projectId: v.id('gmProjects'),
    kind: sheetKindValidator,
    title: v.string(),
  },
  returns: v.id('gmSheets'),
  handler: async (ctx, { projectId, kind, title }) => {
    const user = await requireUser(ctx)
    await ownedProject(ctx, projectId, user._id)
    const parsed = gmTitle.safeParse(title)
    if (!parsed.success) throw new ConvexError({ code: 'INVALID_INPUT' })
    if ((await liveSheetCount(ctx, projectId)) >= GM_MAX_SHEETS)
      throw new ConvexError({ code: 'SHEET_LIMIT' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    const updatedAt = Date.now()
    const common = { ownerId: user._id, projectId, updatedAt }
    const sheetId = await ctx.db.insert('gmSheets', {
      ...common,
      kind,
      title: parsed.data,
      summary: '',
      version: 0,
    })
    await ctx.db.insert('gmSheetContents', {
      ...common,
      sheetId,
      body: '',
      fields: [],
    })
    return sheetId
  },
})

export const updateSheet = mutation({
  args: {
    id: v.id('gmSheets'),
    expectedVersion: v.number(),
    kind: sheetKindValidator,
    title: v.string(),
    summary: v.string(),
    body: v.string(),
    fields: v.array(sheetFieldValidator),
  },
  returns: v.number(),
  handler: async (ctx, { id, expectedVersion, kind, ...input }) => {
    const user = await requireUser(ctx)
    const sheet = await ownedSheet(ctx, id, user._id)
    if (sheet.deletedAt !== undefined)
      throw new ConvexError({ code: 'NOT_FOUND' })
    const parsed = gmSheetContent.safeParse(input)
    if (!parsed.success) throw new ConvexError({ code: 'INVALID_INPUT' })
    if (sheet.version !== expectedVersion)
      throw new ConvexError({ code: 'CONFLICT' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    const content = await contentOf(ctx, id)
    const updatedAt = Date.now()
    const version = sheet.version + 1
    await ctx.db.patch('gmSheets', id, {
      kind,
      title: parsed.data.title,
      summary: parsed.data.summary,
      version,
      updatedAt,
    })
    await ctx.db.patch('gmSheetContents', content._id, {
      body: parsed.data.body,
      fields: parsed.data.fields,
      updatedAt,
    })
    return version
  },
})

// Opérations atomiques : un lien vers une fiche en corbeille reste stocké
// (masqué) et n'est jamais retiré par l'édition des autres liens.
async function liveSource(ctx: QueryCtx, id: Id<'gmSheets'>, ownerId: string) {
  const sheet = await ownedSheet(ctx, id, ownerId)
  if (sheet.deletedAt !== undefined)
    throw new ConvexError({ code: 'NOT_FOUND' })
  return sheet
}

function outgoingLinks(ctx: QueryCtx, id: Id<'gmSheets'>) {
  return ctx.db
    .query('gmSheetLinks')
    .withIndex('by_from', (q) => q.eq('fromId', id))
    .take(GM_MAX_SHEET_LINKS + 1)
}

export const addSheetLink = mutation({
  args: { id: v.id('gmSheets'), target: v.id('gmSheets') },
  returns: v.null(),
  handler: async (ctx, { id, target: targetId }) => {
    const user = await requireUser(ctx)
    const sheet = await liveSource(ctx, id, user._id)
    if (targetId === id) throw new ConvexError({ code: 'INVALID_INPUT' })
    const target = await ctx.db.get('gmSheets', targetId)
    if (
      !target ||
      target.ownerId !== user._id ||
      target.projectId !== sheet.projectId ||
      target.deletedAt !== undefined
    )
      throw new ConvexError({ code: 'NOT_FOUND' })
    const existing = await outgoingLinks(ctx, id)
    if (existing.some((link) => link.toId === targetId)) return null
    if (existing.length >= GM_MAX_SHEET_LINKS)
      throw new ConvexError({ code: 'LINK_LIMIT' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    await ctx.db.insert('gmSheetLinks', {
      ownerId: user._id,
      projectId: sheet.projectId,
      fromId: id,
      toId: targetId,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const removeSheetLink = mutation({
  args: { id: v.id('gmSheets'), target: v.id('gmSheets') },
  returns: v.null(),
  handler: async (ctx, { id, target }) => {
    const user = await requireUser(ctx)
    await liveSource(ctx, id, user._id)
    const links = (await outgoingLinks(ctx, id)).filter(
      (link) => link.toId === target
    )
    if (links.length === 0) return null
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    for (const link of links) await ctx.db.delete('gmSheetLinks', link._id)
    return null
  },
})

export const trashSheet = mutation({
  args: { id: v.id('gmSheets') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx)
    const sheet = await ownedSheet(ctx, id, user._id)
    if (sheet.deletedAt !== undefined)
      throw new ConvexError({ code: 'NOT_FOUND' })
    if ((await trashedSheetCount(ctx, sheet.projectId)) >= GM_MAX_TRASH)
      throw new ConvexError({ code: 'TRASH_LIMIT' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    const now = Date.now()
    await ctx.db.patch('gmSheets', id, { deletedAt: now, updatedAt: now })
    return null
  },
})

export const restoreSheet = mutation({
  args: { id: v.id('gmSheets') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx)
    const sheet = await ownedSheet(ctx, id, user._id)
    if (sheet.deletedAt === undefined)
      throw new ConvexError({ code: 'NOT_FOUND' })
    if ((await liveSheetCount(ctx, sheet.projectId)) >= GM_MAX_SHEETS)
      throw new ConvexError({ code: 'SHEET_LIMIT' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    await ctx.db.patch('gmSheets', id, {
      deletedAt: undefined,
      updatedAt: Date.now(),
    })
    return null
  },
})

async function deleteLinks(
  ctx: MutationCtx,
  index: 'by_from' | 'by_to',
  sheetId: Id<'gmSheets'>
) {
  // Au plus GM_MAX_SHEET_LINKS sortants ; au plus GM_MAX_SHEETS + GM_MAX_TRASH
  // - 1 entrants (fiches vivantes et en corbeille), documents d'environ 200 o.
  const links =
    index === 'by_from'
      ? await ctx.db
          .query('gmSheetLinks')
          .withIndex('by_from', (q) => q.eq('fromId', sheetId))
          .take(GM_MAX_SHEET_LINKS + 1)
      : await ctx.db
          .query('gmSheetLinks')
          .withIndex('by_to', (q) => q.eq('toId', sheetId))
          .take(GM_MAX_SHEETS + GM_MAX_TRASH)
  for (const link of links) await ctx.db.delete('gmSheetLinks', link._id)
}

export const deleteSheetForever = mutation({
  args: { id: v.id('gmSheets') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx)
    const sheet = await ownedSheet(ctx, id, user._id)
    if (sheet.deletedAt === undefined)
      throw new ConvexError({ code: 'NOT_IN_TRASH' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    await deleteLinks(ctx, 'by_from', id)
    await deleteLinks(ctx, 'by_to', id)
    const content = await ctx.db
      .query('gmSheetContents')
      .withIndex('by_sheet', (q) => q.eq('sheetId', id))
      .unique()
    if (content) await ctx.db.delete('gmSheetContents', content._id)
    await ctx.db.delete('gmSheets', id)
    return null
  },
})
