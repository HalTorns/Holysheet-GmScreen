import { ConvexError } from 'convex/values'

import { GM_MAX_MERCHANT_STOCK } from '../../shared/merchants'
import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import { ownedSheet } from './gmAccess'

export async function catalogSheet(
  ctx: QueryCtx,
  id: Id<'gmSheets'>,
  ownerId: string,
  kind: 'merchant' | 'item',
  live = true
) {
  const sheet = await ownedSheet(ctx, id, ownerId)
  if (sheet.kind !== kind || (live && sheet.deletedAt !== undefined))
    throw new ConvexError({ code: 'NOT_FOUND' })
  return sheet
}
export function profileOf(ctx: QueryCtx, sheetId: Id<'gmSheets'>) {
  return ctx.db
    .query('gmItemProfiles')
    .withIndex('by_sheet', (q) => q.eq('sheetId', sheetId))
    .unique()
}
export function stockOf(ctx: QueryCtx, merchantId: Id<'gmSheets'>) {
  return ctx.db
    .query('gmMerchantStock')
    .withIndex('by_merchant', (q) => q.eq('merchantId', merchantId))
    .take(GM_MAX_MERCHANT_STOCK)
}
export async function stockRow(
  ctx: QueryCtx,
  id: Id<'gmMerchantStock'>,
  ownerId: string
) {
  const row = await ctx.db.get('gmMerchantStock', id)
  if (!row || row.ownerId !== ownerId)
    throw new ConvexError({ code: 'NOT_FOUND' })
  const merchant = await catalogSheet(ctx, row.merchantId, ownerId, 'merchant')
  const item = await catalogSheet(ctx, row.itemId, ownerId, 'item')
  if (
    item.projectId !== merchant.projectId ||
    row.projectId !== merchant.projectId
  )
    throw new ConvexError({ code: 'NOT_FOUND' })
  return row
}
export async function resolveStock(ctx: QueryCtx, row: Doc<'gmMerchantStock'>) {
  const item = await ctx.db.get('gmSheets', row.itemId)
  const profile = await profileOf(ctx, row.itemId)
  if (
    !item ||
    item.kind !== 'item' ||
    item.ownerId !== row.ownerId ||
    item.projectId !== row.projectId
  )
    throw new ConvexError({ code: 'NOT_FOUND' })
  const effectivePrice = row.price ?? profile?.price
  return {
    ...row,
    item: {
      title: item.title,
      deleted: item.deletedAt !== undefined,
      ...(profile?.price === undefined ? {} : { price: profile.price }),
      currency: profile?.currency ?? '',
      category: profile?.category ?? '',
    },
    ...(effectivePrice === undefined ? {} : { effectivePrice }),
  }
}
