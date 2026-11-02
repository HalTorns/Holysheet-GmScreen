import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { GM_MAX_ITEM_PROFILES, gmItemProfile } from '../shared/merchants'
import { mutation, query } from './_generated/server'
import { requireUser } from './lib/auth'
import { itemProfileValidator } from './lib/gmValidators'
import { catalogSheet, profileOf } from './lib/merchants'
import { limitUserOperation } from './lib/rateLimits'

export const getProfile = query({
  args: { sheetId: v.id('gmSheets') },
  returns: v.union(v.null(), itemProfileValidator),
  handler: async (ctx, { sheetId }) => {
    const user = await requireUser(ctx)
    await catalogSheet(ctx, sheetId, user._id, 'item', false)
    return profileOf(ctx, sheetId)
  },
})
export const setProfile = mutation({
  args: {
    sheetId: v.id('gmSheets'),
    expectedVersion: v.number(),
    price: v.optional(v.number()),
    currency: v.string(),
    category: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, { sheetId, expectedVersion, ...input }) => {
    const user = await requireUser(ctx)
    const sheet = await catalogSheet(ctx, sheetId, user._id, 'item')
    const parsed = gmItemProfile.safeParse(input)
    if (!parsed.success) throw new ConvexError({ code: 'INVALID_INPUT' })
    const profile = await profileOf(ctx, sheetId)
    if ((profile?.version ?? 0) !== expectedVersion)
      throw new ConvexError({ code: 'CONFLICT' })
    if (!profile) {
      const profiles = await ctx.db
        .query('gmItemProfiles')
        .withIndex('by_project_category', (q) =>
          q.eq('projectId', sheet.projectId)
        )
        .take(GM_MAX_ITEM_PROFILES)
      if (profiles.length >= GM_MAX_ITEM_PROFILES)
        throw new ConvexError({ code: 'ITEM_PROFILE_LIMIT' })
    }
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    const version = expectedVersion + 1
    if (profile)
      await ctx.db.replace('gmItemProfiles', profile._id, {
        ownerId: user._id,
        projectId: sheet.projectId,
        sheetId,
        currency: parsed.data.currency,
        category: parsed.data.category,
        ...(parsed.data.price === undefined
          ? {}
          : { price: parsed.data.price }),
        version,
      })
    else
      await ctx.db.insert('gmItemProfiles', {
        ownerId: user._id,
        projectId: sheet.projectId,
        sheetId,
        currency: parsed.data.currency,
        category: parsed.data.category,
        ...(parsed.data.price === undefined
          ? {}
          : { price: parsed.data.price }),
        version,
      })
    return version
  },
})
export const sellers = query({
  args: { sheetId: v.id('gmSheets'), paginationOpts: paginationOptsValidator },
  returns: v.object({
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
    page: v.array(
      v.object({
        merchantId: v.id('gmSheets'),
        title: v.string(),
        deleted: v.boolean(),
        quantity: v.union(v.number(), v.null()),
        effectivePrice: v.optional(v.number()),
        currency: v.string(),
      })
    ),
  }),
  handler: async (ctx, { sheetId, paginationOpts }) => {
    const user = await requireUser(ctx)
    const sheet = await catalogSheet(ctx, sheetId, user._id, 'item', false)
    const profile = await profileOf(ctx, sheetId)
    const result = await ctx.db
      .query('gmMerchantStock')
      .withIndex('by_item', (q) => q.eq('itemId', sheetId))
      .paginate({
        ...paginationOpts,
        numItems: Math.min(50, Math.max(1, paginationOpts.numItems)),
      })
    const page = await Promise.all(
      result.page.map(async (row) => {
        const merchant = await catalogSheet(
          ctx,
          row.merchantId,
          user._id,
          'merchant',
          false
        )
        if (
          merchant.projectId !== sheet.projectId ||
          row.ownerId !== user._id ||
          row.projectId !== sheet.projectId
        )
          throw new ConvexError({ code: 'NOT_FOUND' })
        const effectivePrice = row.price ?? profile?.price
        return {
          merchantId: merchant._id,
          title: merchant.title,
          deleted: merchant.deletedAt !== undefined,
          quantity: row.quantity,
          ...(effectivePrice === undefined ? {} : { effectivePrice }),
          currency: profile?.currency ?? '',
        }
      })
    )
    return { ...result, page }
  },
})
