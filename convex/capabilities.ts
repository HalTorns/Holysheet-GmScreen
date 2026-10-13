import { v } from 'convex/values'
import { query } from './_generated/server'
import { organizationsEnabled } from './lib/modules'

export const get = query({
  args: {},
  returns: v.object({ organizations: v.boolean() }),
  handler: () => ({ organizations: organizationsEnabled() }),
})
