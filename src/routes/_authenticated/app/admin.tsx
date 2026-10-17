import { api } from '@convex/_generated/api'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { SupportPanel } from '@/features/admin/support-panel'
import { fetchAuthQuery } from '@/lib/auth-server'

const getAdminAccess = createServerFn({ method: 'GET' }).handler(() =>
  fetchAuthQuery(api.auth.getAccessState, {})
)

export const Route = createFileRoute('/_authenticated/app/admin')({
  loader: async () => {
    const access = await getAdminAccess()
    if (!access?.isSupport) throw redirect({ to: '/app' })
  },
  head: () => ({
    meta: [
      { title: 'Support de la plateforme' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: SupportPanel,
})
