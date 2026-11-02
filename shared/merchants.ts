import { z } from './zod'

// Bornes provisoires : lectures et transactions bornées, sans catalogue importé.
export const GM_MAX_MERCHANT_STOCK = 200
export const GM_MAX_ITEM_PROFILES = 2000
export const GM_MAX_STOCK_QUANTITY = 1_000_000
const gmPrice = z
  .number()
  .nonnegative()
  .refine(
    (value) =>
      Number.isInteger(value) || value === Math.round(value * 100) / 100
  )
export const gmItemProfile = z.object({
  price: gmPrice.optional(),
  currency: z.string().trim().max(20),
  category: z.string().trim().max(80),
})
export const gmStockValues = z.object({
  quantity: z.number().int().min(0).max(GM_MAX_STOCK_QUANTITY).nullable(),
  price: gmPrice.optional(),
  available: z.boolean(),
})
