import { v } from 'convex/values'

import { components } from './_generated/api'
import { internalMutation } from './_generated/server'
import { backfillResult } from './betterAuth/profiles'
import { getProfilePolicy } from './lib/profilePolicy'

// Local operators migrate existing accounts before reopening profile editing.
export const backfill = internalMutation({
  args: {
    cursor: v.union(v.null(), v.object({ at: v.number(), id: v.string() })),
  },
  returns: backfillResult,
  handler: (ctx, args) =>
    ctx.runMutation(components.betterAuth.profiles.backfill, {
      ...args,
      unique: getProfilePolicy().unique,
    }),
})
