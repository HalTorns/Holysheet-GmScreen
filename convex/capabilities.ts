import { v } from 'convex/values'

import { query } from './_generated/server'
import { getAuthModules } from './lib/authModules'

export const get = query({
  args: {},
  returns: v.object({
    magicLink: v.boolean(),
    mfa: v.boolean(),
    credentials: v.boolean(),
    passwordOnly: v.optional(v.boolean()),
    socialProviders: v.array(v.union(v.literal('google'), v.literal('github'))),
  }),
  handler: () => {
    const modules = getAuthModules()
    const socialProviders: ('google' | 'github')[] = []
    if (modules.AUTH_GOOGLE_ENABLED) socialProviders.push('google')
    if (modules.AUTH_GITHUB_ENABLED) socialProviders.push('github')
    return {
      magicLink: modules.AUTH_MAGIC_LINK_ENABLED,
      mfa: modules.AUTH_MFA_ENABLED,
      credentials:
        modules.AUTH_CREDENTIALS_ENABLED || modules.AUTH_PASSWORD_ONLY,
      ...(modules.AUTH_PASSWORD_ONLY ? { passwordOnly: true } : {}),
      socialProviders,
    }
  },
})
