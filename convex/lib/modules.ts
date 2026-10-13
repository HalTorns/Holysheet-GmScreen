import { ConvexError } from 'convex/values'

export function organizationsEnabled() {
  const value = process.env.ORGANIZATIONS_ENABLED
  if (value === undefined || value === 'false') return false
  if (value === 'true') return true
  throw new Error('ORGANIZATIONS_ENABLED must be true or false.')
}

export function requireOrganizationsEnabled() {
  if (!organizationsEnabled())
    throw new ConvexError({ code: 'MODULE_DISABLED' })
}
