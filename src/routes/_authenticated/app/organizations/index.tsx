import { api } from '@convex/_generated/api'
import { appConfig } from '@shared/app-config'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { ErrorState, LoadingState } from '@/components/page-state'
import { OrganizationList } from '@/features/organizations/organization-list'
import { ensureConvexQuery } from '@/lib/convex-query'

export const Route = createFileRoute('/_authenticated/app/organizations/')({
  head: () => ({ meta: [{ title: `Organisations — ${appConfig.name}` }] }),
  loader: async ({ context }) => {
    const capabilities = await ensureConvexQuery(
      context.queryClient,
      api.capabilities.get,
      {}
    )
    if (!capabilities.organizations) throw redirect({ to: '/app' })
    await Promise.all([
      ensureConvexQuery(context.queryClient, api.organizations.list, {}),
      ensureConvexQuery(context.queryClient, api.organizations.invitations, {}),
    ])
  },
  pendingComponent: LoadingState,
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
  component: OrganizationList,
})
