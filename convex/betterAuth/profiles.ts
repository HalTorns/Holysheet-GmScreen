import { ConvexError, v } from 'convex/values'

import { displayNameKey, displayNameSchema } from '../../shared/validation'
import { mutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'

function nameOwner(ctx: MutationCtx, key: string) {
  return ctx.db
    .query('user')
    .withIndex('nameKey', (q) => q.eq('nameKey', key))
    .take(2)
}

// Only the authenticated parent mutation can call this component function.
// The indexed read and both profile fields commit in the same transaction.
export const setName = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    unique: v.boolean(),
    expectedVersion: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const parsed = displayNameSchema.safeParse(args.name)
    if (!parsed.success) throw new ConvexError({ code: 'INVALID_USERNAME' })
    const id = ctx.db.normalizeId('user', args.userId)
    const user = id ? await ctx.db.get('user', id) : null
    if (!user) throw new ConvexError({ code: 'UNAUTHENTICATED' })
    if ((user.profileVersion ?? 0) !== args.expectedVersion)
      throw new ConvexError({ code: 'CONFLICT' })
    const key = displayNameKey(parsed.data)
    if (
      args.unique &&
      (await nameOwner(ctx, key)).some((owner) => owner._id !== user._id)
    )
      throw new ConvexError({ code: 'USERNAME_TAKEN' })
    const profileVersion = (user.profileVersion ?? 0) + 1
    await ctx.db.patch('user', user._id, {
      name: parsed.data,
      nameKey: key,
      updatedAt: Date.now(),
      profileVersion,
    })
    return profileVersion
  },
})

const cursorValidator = v.union(
  v.null(),
  v.object({ at: v.number(), id: v.string() })
)
export const backfillResult = v.object({
  cursor: cursorValidator,
  isDone: v.boolean(),
  scanned: v.number(),
  claimed: v.number(),
  conflicts: v.number(),
  incomplete: v.number(),
})

// Additive, bounded and idempotent. Existing display strings are preserved;
// an unclaimed conflicting/invalid name must be chosen again by its owner.
export const backfill = mutation({
  args: { cursor: cursorValidator, unique: v.boolean() },
  returns: backfillResult,
  handler: async (ctx, { cursor, unique }) => {
    const after = cursor ? ctx.db.normalizeId('user', cursor.id) : null
    if (cursor && !after) throw new ConvexError({ code: 'INVALID_INPUT' })
    const collection = ctx.db
      .query('user')
      .withIndex('by_creation_time', (q) =>
        q.gte('_creationTime', cursor?.at ?? 0)
      )
      .order('asc')
    const rows = await (
      cursor && after
        ? collection.filter((q) =>
            q.or(
              q.gt(q.field('_creationTime'), cursor.at),
              q.and(
                q.eq(q.field('_creationTime'), cursor.at),
                q.gt(q.field('_id'), after)
              )
            )
          )
        : collection
    ).take(100)
    let claimed = 0
    let conflicts = 0
    let incomplete = 0
    for (const user of rows) {
      if (!user.role) await ctx.db.patch('user', user._id, { role: 'user' })
      if (!displayNameSchema.safeParse(user.name).success) {
        incomplete++
        if (user.nameKey)
          await ctx.db.patch('user', user._id, { nameKey: undefined })
        continue
      }
      const key = displayNameKey(user.name)
      if (
        unique &&
        (await nameOwner(ctx, key)).some((owner) => owner._id !== user._id)
      ) {
        conflicts++
        if (user.nameKey)
          await ctx.db.patch('user', user._id, { nameKey: undefined })
        continue
      }
      if (user.nameKey !== key) {
        await ctx.db.patch('user', user._id, { nameKey: key })
        claimed++
      }
    }
    const last = rows.at(-1)
    return {
      cursor: last ? { at: last._creationTime, id: last._id } : null,
      isDone: rows.length < 100,
      scanned: rows.length,
      claimed,
      conflicts,
      incomplete,
    }
  },
})
