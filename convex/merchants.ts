import { ConvexError, v } from 'convex/values'

import {
  GM_MAX_MERCHANT_STOCK,
  GM_MAX_STOCK_QUANTITY,
  gmStockValues,
} from '../shared/merchants'
import { mutation, query } from './_generated/server'
import { requireUser } from './lib/auth'
import { stockFields } from './lib/gmValidators'
import { catalogSheet, resolveStock, stockOf, stockRow } from './lib/merchants'
import { limitUserOperation } from './lib/rateLimits'

export const getStock = query({
  args: { merchantId: v.id('gmSheets') },
  returns: v.array(
    v.object({
      _id: v.id('gmMerchantStock'),
      _creationTime: v.number(),
      ...stockFields,
      item: v.object({
        title: v.string(),
        deleted: v.boolean(),
        price: v.optional(v.number()),
        currency: v.string(),
        category: v.string(),
      }),
      effectivePrice: v.optional(v.number()),
    })
  ),
  handler: async (ctx, { merchantId }) => {
    const user = await requireUser(ctx)
    const merchant = await catalogSheet(
      ctx,
      merchantId,
      user._id,
      'merchant',
      false
    )
    const rows = await stockOf(ctx, merchantId)
    if (
      rows.some(
        (row) =>
          row.ownerId !== user._id || row.projectId !== merchant.projectId
      )
    )
      throw new ConvexError({ code: 'NOT_FOUND' })
    return Promise.all(
      rows
        .sort((a, b) => a.order - b.order || a._creationTime - b._creationTime)
        .map((row) => resolveStock(ctx, row))
    )
  },
})
export const addStock = mutation({
  args: { merchantId: v.id('gmSheets'), itemId: v.id('gmSheets') },
  returns: v.id('gmMerchantStock'),
  handler: async (ctx, { merchantId, itemId }) => {
    const user = await requireUser(ctx)
    const merchant = await catalogSheet(ctx, merchantId, user._id, 'merchant')
    const item = await catalogSheet(ctx, itemId, user._id, 'item')
    if (merchant.projectId !== item.projectId)
      throw new ConvexError({ code: 'NOT_FOUND' })
    const existing = await ctx.db
      .query('gmMerchantStock')
      .withIndex('by_merchant_item', (q) =>
        q.eq('merchantId', merchantId).eq('itemId', itemId)
      )
      .unique()
    if (existing) throw new ConvexError({ code: 'STOCK_DUPLICATE' })
    const rows = await stockOf(ctx, merchantId)
    if (rows.length >= GM_MAX_MERCHANT_STOCK)
      throw new ConvexError({ code: 'STOCK_LIMIT' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    return ctx.db.insert('gmMerchantStock', {
      ownerId: user._id,
      projectId: merchant.projectId,
      merchantId,
      itemId,
      quantity: 1,
      available: true,
      order: Math.max(-1, ...rows.map((row) => row.order)) + 1,
      version: 0,
    })
  },
})
export const updateStock = mutation({
  args: {
    id: v.id('gmMerchantStock'),
    expectedVersion: v.number(),
    quantity: v.union(v.number(), v.null()),
    price: v.optional(v.number()),
    available: v.boolean(),
  },
  returns: v.number(),
  handler: async (ctx, { id, expectedVersion, ...input }) => {
    const user = await requireUser(ctx)
    const row = await stockRow(ctx, id, user._id)
    if (row.version !== expectedVersion)
      throw new ConvexError({ code: 'CONFLICT' })
    const parsed = gmStockValues.safeParse(input)
    if (!parsed.success) throw new ConvexError({ code: 'INVALID_INPUT' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    await ctx.db.patch('gmMerchantStock', id, {
      ...parsed.data,
      price: parsed.data.price,
      version: row.version + 1,
    })
    return row.version + 1
  },
})
export const adjustQuantity = mutation({
  args: { id: v.id('gmMerchantStock'), delta: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, delta }) => {
    const user = await requireUser(ctx)
    const row = await stockRow(ctx, id, user._id)
    if (!Number.isSafeInteger(delta) || Math.abs(delta) > GM_MAX_STOCK_QUANTITY)
      throw new ConvexError({ code: 'INVALID_INPUT' })
    await limitUserOperation(ctx, 'gmEditorWrite', user._id)
    if (row.quantity === null) return null
    const quantity = Math.min(
      GM_MAX_STOCK_QUANTITY,
      Math.max(0, row.quantity + delta)
    )
    if (quantity !== row.quantity)
      await ctx.db.patch('gmMerchantStock', id, {
        quantity,
        version: row.version + 1,
      })
    return null
  },
})
export const removeStock = mutation({
  args: { id: v.id('gmMerchantStock') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx)
    // A trashed item must still be removable from a live merchant.
    const row = await ctx.db.get('gmMerchantStock', id)
    if (!row || row.ownerId !== user._id)
      throw new ConvexError({ code: 'NOT_FOUND' })
    const merchant = await catalogSheet(
      ctx,
      row.merchantId,
      user._id,
      'merchant'
    )
    const item = await catalogSheet(ctx, row.itemId, user._id, 'item', false)
    if (
      item.projectId !== merchant.projectId ||
      row.projectId !== merchant.projectId
    )
      throw new ConvexError({ code: 'NOT_FOUND' })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    await ctx.db.delete('gmMerchantStock', id)
    return null
  },
})
export const reorderStock = mutation({
  args: { merchantId: v.id('gmSheets'), ids: v.array(v.id('gmMerchantStock')) },
  returns: v.null(),
  handler: async (ctx, { merchantId, ids }) => {
    const user = await requireUser(ctx)
    const merchant = await catalogSheet(ctx, merchantId, user._id, 'merchant')
    const rows = await stockOf(ctx, merchantId)
    if (
      ids.length !== rows.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !rows.some((row) => row._id === id))
    )
      throw new ConvexError({ code: 'INVALID_INPUT' })
    // Validate both ends even when only changing presentation order.
    for (const row of rows) {
      const item = await catalogSheet(ctx, row.itemId, user._id, 'item', false)
      if (
        item.projectId !== merchant.projectId ||
        row.projectId !== merchant.projectId ||
        row.ownerId !== user._id
      )
        throw new ConvexError({ code: 'NOT_FOUND' })
    }
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    for (const [order, id] of ids.entries())
      await ctx.db.patch('gmMerchantStock', id, { order })
    return null
  },
})
