import { api } from '@convex/_generated/api'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { MfaChallenge } from '@/features/auth/mfa-challenge'
import { ensureConvexQuery } from '@/lib/convex-query'

export const Route = createFileRoute('/verify-mfa')({
  loader: async ({ context }) => {
    const access = await ensureConvexQuery(
      context.queryClient,
      api.auth.getAccessState,
      {}
    )
    if (!access) throw redirect({ to: '/sign-in' })
    if (!access.requiresMfa) throw redirect({ to: '/app' })
  },
  head: () => ({
    meta: [
      { title: 'Vérification de votre connexion' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: MfaChallenge,
})
